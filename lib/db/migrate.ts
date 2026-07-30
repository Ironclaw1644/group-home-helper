import 'server-only';

import type { PGlite } from '@electric-sql/pglite';
import { MIGRATIONS } from './migrations.generated';

/**
 * Migration runner.
 *
 * Migrations are compiled into `migrations.generated.ts` by
 * `npm run db:bundle` so they travel with the packaged desktop app rather than
 * having to be located on disk at runtime. `db/migrations/*.sql` stays the
 * source of truth.
 *
 * Each file runs once, inside a transaction, tracked by filename. A failure
 * rolls back that file and stops the run — a half-applied schema is worse than
 * an unstarted one.
 */
export async function runMigrations(db: PGlite): Promise<void> {
  await db.exec(`
    create table if not exists public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const applied = await db.query<{ name: string }>('select name from public.schema_migrations');
  const done = new Set(applied.rows.map((r) => r.name));

  for (const migration of MIGRATIONS) {
    if (done.has(migration.name)) continue;

    try {
      await db.transaction(async (tx) => {
        await tx.exec(migration.sql);
        await tx.query('insert into public.schema_migrations (name) values ($1)', [migration.name]);
      });
      console.log(`[db] applied ${migration.name}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Migration ${migration.name} failed: ${detail}`);
    }
  }
}
