/**
 * Prove the repository can rebuild the database, and that what it builds is
 * what production actually has.
 *
 *   npm run verify:schema              compare a fresh run against the snapshot
 *   npm run verify:schema -- --refresh re-read production and update it
 *
 * The audit found that it could not. Migrations 0007 and 0008 were missing,
 * 0016 was fifteen lines of comments and no SQL, and three live tables holding
 * thousands of rows — documents, outcome_activities, note_activities — had no
 * `create table` anywhere in the repo. 0006 created a bucket named
 * `signatures` while the code has always used `ghh-signatures`. So a
 * disaster-recovery rebuild, a staging environment, or a security review that
 * reads the repo would each have come to the wrong conclusion, and the question
 * "does every table have an RLS policy?" was not answerable from source.
 *
 * This closes that. Every migration in supabase/migrations/ is applied in order
 * to a throwaway embedded Postgres, the result is introspected, and it is
 * compared against `supabase/schema-snapshot.json` — a structural record of
 * production. Tables, columns, types, nullability, defaults, constraints,
 * indexes, RLS policies, triggers, and storage buckets all have to match.
 *
 * The snapshot holds structure only. No note, resident, or audit row is ever
 * read, so nothing it contains is PHI. Refreshing it needs a Supabase CLI
 * login; comparing does not, so the check runs offline and in CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { QUERIES, readOnlyQuery } from './live-schema';

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');
const COMPAT = path.join(process.cwd(), 'scripts', 'supabase-compat.sql');
const SNAPSHOT = path.join(process.cwd(), 'supabase', 'schema-snapshot.json');

/**
 * What is compared, and the key that identifies one row of it.
 *
 * `grants` and `functions` are deliberately absent. Function bodies are
 * reformatted by Postgres on the way back out and differ harmlessly between
 * versions, and Supabase adds its own default grants that no migration here
 * asks for. Both would fail loudly for no defect, and a check that cries wolf
 * gets switched off.
 */
const COMPARED = {
  tables: (r: Row) => String(r.name),
  columns: (r: Row) => `${r.table_name}.${r.column_name}`,
  constraints: (r: Row) => `${r.table_name}.${r.name}`,
  indexes: (r: Row) => `${r.table_name}.${r.name}`,
  policies: (r: Row) => `${r.table_name}.${r.name}`,
  triggers: (r: Row) => `${r.table_name}.${r.name}`,
  buckets: (r: Row) => String(r.id)
} as const;

type Row = Record<string, unknown>;
type Snapshot = Record<string, Row[]>;

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${name}${!ok && detail ? `\n           ${detail}` : ''}`);
  if (!ok) failures++;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/**
 * Make two servers' rendering of the same object comparable.
 *
 * Postgres re-prints constraint, index and policy definitions from the parse
 * tree, and the spacing, casing and schema qualification differ between the
 * embedded build and Supabase's. None of that is a schema difference.
 */
function normalise(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\s+/g, ' ')
    .replace(/\bghh\./g, '')
    .replace(/::text\b/g, '')
    .replace(/[()]/g, '')
    .trim()
    .toLowerCase();
}

function normaliseRow(row: Row, ignore: string[] = []): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (ignore.includes(k)) continue;
    out[k] = normalise(v);
  }
  return out;
}

/** Fields that legitimately differ between an embedded build and Supabase. */
const IGNORED_FIELDS: Record<string, string[]> = {
  // `permissive` renders differently between versions; the qual is what decides
  // who can read what, and that is compared.
  policies: ['permissive'],
  // A table comment is documentation, not structure. Requiring a match would
  // mean the only way to improve a comment in this repo is to run DDL against
  // a production database holding PHI, which is a worse trade than letting the
  // prose drift.
  tables: ['comment']
};

// ---------------------------------------------------------------------------
// Build a fresh database from the repo
// ---------------------------------------------------------------------------

async function buildFromRepo(): Promise<Snapshot> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.waitReady;

  await db.exec(fs.readFileSync(COMPAT, 'utf8'));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log(`\nApplying ${files.length} migration(s) to a throwaway database\n`);

  for (const file of files) {
    try {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      console.log(`  ok     ${file}`);
    } catch (err) {
      failures++;
      console.log(`  FAIL   ${file}\n           ${(err as Error).message}`);
      await db.close();
      throw new Error(`Migration ${file} does not apply to an empty database.`);
    }
  }

  const built: Snapshot = {};
  for (const name of Object.keys(COMPARED)) {
    const res = await db.query<Row>(QUERIES[name]);
    built[name] = res.rows;
  }

  await db.close();
  return built;
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

function compare(built: Snapshot, live: Snapshot) {
  for (const [name, keyOf] of Object.entries(COMPARED)) {
    console.log(`\n${name}\n`);

    const ignore = IGNORED_FIELDS[name] ?? [];
    const index = (rows: Row[]) =>
      new Map(rows.map((r) => [keyOf(r as never), normaliseRow(r, ignore)]));

    const b = index(built[name] ?? []);
    const l = index(live[name] ?? []);

    const missing = [...l.keys()].filter((k) => !b.has(k));
    const extra = [...b.keys()].filter((k) => !l.has(k));

    check(
      `every ${name} entry in production exists in the repo`,
      missing.length === 0,
      missing.length ? `missing from a fresh build: ${missing.join(', ')}` : undefined
    );
    check(
      `the repo creates no ${name} entry production does not have`,
      extra.length === 0,
      extra.length ? `only in the repo: ${extra.join(', ')}` : undefined
    );

    const differing: string[] = [];
    for (const [key, liveRow] of l) {
      const builtRow = b.get(key);
      if (!builtRow) continue;
      for (const [field, liveValue] of Object.entries(liveRow)) {
        if (JSON.stringify(builtRow[field]) !== JSON.stringify(liveValue)) {
          differing.push(`${key}.${field}: repo=${builtRow[field]} prod=${liveValue}`);
        }
      }
    }
    check(
      `matching ${name} entries are defined identically`,
      differing.length === 0,
      differing.slice(0, 8).join('\n           ')
    );
  }
}

/**
 * The question the audit could not answer from source.
 *
 * "Does every table have an RLS policy?" had to be answered empirically against
 * the production database, because three of the tables were not in the repo at
 * all. Now that a fresh build reproduces production, the answer is derivable
 * here — and stays derivable when someone adds the next table.
 */
function checkEveryTableIsProtected(built: Snapshot) {
  console.log('\nevery table is protected\n');

  const policied = new Set((built.policies ?? []).map((p) => String(p.table_name)));

  for (const table of built.tables ?? []) {
    const name = String(table.name);
    check(`${name} has row level security enabled`, table.rls_enabled === true);
    check(`${name} has at least one policy`, policied.has(name), 'RLS on with no policy denies everyone, including the app');
  }
}

// ---------------------------------------------------------------------------

async function refresh() {
  console.log('\nReading production structure (read-only, no row data)\n');
  const snapshot: Snapshot = {};
  for (const name of Object.keys(COMPARED)) {
    snapshot[name] = await readOnlyQuery<Row>(QUERIES[name]);
    console.log(`  ${name}: ${snapshot[name].length} row(s)`);
  }
  fs.writeFileSync(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(process.cwd(), SNAPSHOT)}\n`);
}

async function main() {
  if (process.argv.includes('--refresh')) {
    await refresh();
    return;
  }

  if (!fs.existsSync(SNAPSHOT)) {
    console.error(
      `\nNo snapshot at ${path.relative(process.cwd(), SNAPSHOT)}.\n` +
        'Run `npm run verify:schema -- --refresh` with a Supabase CLI login.\n'
    );
    process.exit(1);
  }

  const live = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) as Snapshot;
  const built = await buildFromRepo();

  compare(built, live);
  checkEveryTableIsProtected(built);

  console.log('');
  if (failures > 0) {
    console.error(`${failures} schema check(s) FAILED — the repo cannot rebuild production.\n`);
    process.exit(1);
  }
  console.log('A fresh migration run reproduces production’s structure.\n');
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
