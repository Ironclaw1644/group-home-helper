import 'server-only';

import path from 'node:path';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * Embedded Postgres.
 *
 * PGlite is a real PostgreSQL 18 build, so the schema, RLS policies, and
 * triggers in supabase/migrations run unchanged — and would run unchanged
 * against a hosted Postgres later. Nothing here is a SQLite-style compromise.
 *
 * Two properties this module exists to guarantee:
 *
 *   1. **Application queries never run as superuser.** PGlite connects as one,
 *      and superusers hold BYPASSRLS, which defeats even FORCE ROW LEVEL
 *      SECURITY. Every request-scoped query goes through `withUser`, which
 *      switches to the unprivileged `ghh_app` role first.
 *
 *   2. **The RLS identity cannot leak between requests.** PGlite has a single
 *      connection, so a session variable set by one request would be visible
 *      to the next. `withUser` therefore sets it transaction-locally and holds
 *      an exclusive lock for the duration.
 */

const APP_ROLE = 'ghh_app';

let instance: PGlite | null = null;
let readyPromise: Promise<PGlite> | null = null;

/** Where the database lives. Electron overrides this with the userData path. */
export function dataDirectory(): string {
  return process.env.GHH_DATA_DIR || path.join(process.cwd(), 'data', 'db');
}

async function open(): Promise<PGlite> {
  const dir = dataDirectory();
  fs.mkdirSync(path.dirname(dir), { recursive: true });

  const db = new PGlite(dir, { extensions: { pgcrypto } });
  await db.waitReady;

  const { runMigrations } = await import('./migrate');
  await runMigrations(db);

  return db;
}

export async function getDb(): Promise<PGlite> {
  if (instance) return instance;
  if (!readyPromise) {
    readyPromise = open().then((db) => {
      instance = db;
      return db;
    });
  }
  return readyPromise;
}

// ---------------------------------------------------------------------------
// Serialization
//
// PGlite processes one statement at a time, but a *sequence* of statements
// from two requests can still interleave. Anything that depends on session
// state — which is every RLS-scoped query — must hold this lock.
// ---------------------------------------------------------------------------

let queue: Promise<unknown> = Promise.resolve();

function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  // Keep the chain alive even when a caller rejects, or one failed query would
  // wedge every later request.
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export type QueryRunner = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
};

function runnerFor(tx: {
  query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  exec: (sql: string) => Promise<unknown>;
}): QueryRunner {
  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const res = await tx.query<T>(sql, params);
      return res.rows;
    },
    async one<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const res = await tx.query<T>(sql, params);
      return res.rows[0] ?? null;
    },
    async exec(sql: string) {
      await tx.exec(sql);
    }
  };
}

/**
 * Run queries as the signed-in user, with RLS enforced.
 *
 * This is the only way request handlers should touch the database. Inside the
 * callback the connection is the unprivileged `ghh_app` role and
 * `app.user_id` is set, so every policy in 0002_rls.sql applies exactly as it
 * would against hosted Postgres.
 *
 * Both settings are transaction-local: they are gone on commit or rollback, so
 * a crash mid-request cannot leave the connection authenticated as someone.
 */
export async function withUser<T>(userId: string, fn: (db: QueryRunner) => Promise<T>): Promise<T> {
  const db = await getDb();

  return exclusive(async () => {
    return db.transaction(async (tx) => {
      // SET LOCAL: scoped to this transaction, reset automatically at commit.
      await tx.exec(`set local role ${APP_ROLE};`);
      await tx.query(`select set_config('app.user_id', $1, true)`, [userId]);
      return fn(runnerFor(tx));
    }) as Promise<T>;
  });
}

/**
 * Run queries with RLS bypassed, as the owning superuser.
 *
 * Reserved for work that genuinely sits outside any one user's permissions:
 * sign-in (looking up an account before there is a session), migrations,
 * decrypting a Medicaid ID after the caller's access has already been proven,
 * and the first-run setup wizard.
 *
 * Every call site should be able to answer "why can this skip RLS?".
 */
export async function withSystem<T>(fn: (db: QueryRunner) => Promise<T>): Promise<T> {
  const db = await getDb();
  return exclusive(async () => {
    return db.transaction(async (tx) => fn(runnerFor(tx))) as Promise<T>;
  });
}

/** Close the database. Called on app quit so the WAL is flushed cleanly. */
export async function closeDb(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
    readyPromise = null;
  }
}
