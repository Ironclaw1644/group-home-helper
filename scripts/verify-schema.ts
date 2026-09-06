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

function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function buildFromRepo(
  files: string[],
  label: string
): Promise<{ built: Snapshot; db: PGlite }> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.waitReady;

  await db.exec(fs.readFileSync(COMPAT, 'utf8'));

  console.log(`\nApplying ${files.length} migration(s) to a throwaway database — ${label}\n`);

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

  return { built, db };
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

/**
 * Signed notes stay immutable, and reaping a demo does not change that.
 *
 * Demo sandboxes accumulated — sixteen of them beside the one real agency —
 * because `prune_expired_demos()` deletes an org and lets the cascade reach its
 * notes, and 0003 refuses to delete a signed note. Every prune raised and
 * removed nothing.
 *
 * The tempting fix is to relax the trigger for demo rows. This proves the fix
 * that was taken instead: reaping walks each resident through
 * `ghh.purge_resident()`, the single audited door that already existed, and the
 * trigger is untouched. So the checks below assert both halves — that a signed
 * note still cannot be deleted or edited by a connection with every privilege,
 * and that the demo cleanup nonetheless completes.
 *
 * PGlite connects as a superuser, which is strictly more privilege than the
 * service_role the auditor attacked production with. If it cannot get through
 * here, service_role cannot get through there.
 */
async function checkImmutabilityAndTheDemoDoor(db: PGlite) {
  console.log('\nsigned notes are immutable, and the demo reaper does not change that\n');

  const ORG = '00000000-0000-0000-0000-000000000001';

  // A demo org shaped like the ones the endpoint creates: its own org, home,
  // resident, and a signed note.
  const setup = await db.query<{ note_id: string; resident_id: string; demo_org: string; author_id: string }>(`
    with o as (
      insert into ghh.organizations (name, is_demo, expires_at, created_via)
      values ('Demo Agency', true, now() - interval '1 day', 'demo')
      returning id
    ),
    h as (
      insert into ghh.homes (org_id, name) select id, 'Demo House' from o returning id, org_id
    ),
    s as (
      insert into ghh.shifts (org_id, home_id, label, start_time, end_time, sort_order)
      select org_id, id, '7AM-7PM', '07:00', '19:00', 0 from h returning id
    ),
    u as (
      insert into auth.users (email) values ('demo-verify@demo.invalid') returning id
    ),
    p as (
      insert into ghh.profiles (id, org_id, full_name, title, role)
      select u.id, o.id, 'Demo User', 'DSP', 'admin' from u, o returning id
    ),
    r as (
      insert into ghh.residents (org_id, home_id, first_name, last_name, is_demo)
      select org_id, id, 'Alex', 'Sample', true from h returning id, org_id
    ),
    n as (
      insert into ghh.notes (org_id, template_id, template_version, resident_id, home_id,
                             shift_id, service_date, author_id, narrative)
      select r.org_id, t.id, t.version, r.id, h.id, s.id, current_date, p.id,
             'A signed demo note.'
      from r, h, s, p, ghh.form_templates t limit 1
      returning id, resident_id, org_id, author_id
    )
    select n.id as note_id, n.resident_id, n.org_id as demo_org, n.author_id from n`);

  const { note_id: noteId, demo_org: demoOrg, author_id: authorId } = setup.rows[0];

  // Signed by update, the way the app does it: `locked` is set by the trigger,
  // and a check constraint refuses a signed row that is not locked.
  await db.query(
    `update ghh.notes
        set status = 'signed', signed_at = now(), signed_by = $2,
            signature_name = 'Demo User', signature_title = 'DSP'
      where id = $1`,
    [noteId, authorId]
  );

  const locked = await db.query<{ locked: boolean }>(
    'select locked from ghh.notes where id = $1',
    [noteId]
  );
  check('signing sets locked by itself', locked.rows[0]?.locked === true);

  const refuses = async (label: string, sql: string, params: unknown[] = []) => {
    let blocked = false;
    try {
      await db.query(sql, params);
    } catch {
      blocked = true;
    }
    check(label, blocked, 'a privileged connection got through');
  };

  await refuses(
    'a signed note cannot be edited, even as superuser',
    `update ghh.notes set narrative = 'tampered' where id = $1`,
    [noteId]
  );
  await refuses(
    'a signed note cannot be deleted, even as superuser',
    `delete from ghh.notes where id = $1`,
    [noteId]
  );
  await refuses('the audit log cannot be rewritten', `update ghh.audit_log set action = 'x'`);
  await refuses('the audit log cannot be deleted', `delete from ghh.audit_log`);

  const narrative = await db.query<{ narrative: string }>(
    'select narrative from ghh.notes where id = $1',
    [noteId]
  );
  check(
    'the signed text is unchanged after every attempt',
    narrative.rows[0]?.narrative === 'A signed demo note.',
    narrative.rows[0]?.narrative
  );

  // The old prune: delete the org and let the cascade do it. This is what has
  // been failing silently in production, and it must still fail — the day it
  // starts working is the day signed notes stopped being immutable.
  await refuses(
    'deleting a demo org outright is still refused while it holds a signed note',
    `delete from ghh.organizations where id = $1`,
    [demoOrg]
  );

  // The reaper's path: each resident through purge_resident, then the org.
  let reaped = true;
  try {
    for (const r of (
      await db.query<{ id: string }>('select id from ghh.residents where org_id = $1', [demoOrg])
    ).rows) {
      await db.query('select ghh.purge_resident($1, null, null, $2)', [r.id, 'verify']);
    }
    await db.query('delete from ghh.organizations where id = $1 and is_demo', [demoOrg]);
  } catch (err) {
    reaped = false;
    check('the reaper path completes', false, (err as Error).message);
  }

  if (reaped) {
    check('the reaper path completes', true);

    const left = await db.query<{ n: number }>(
      `select (select count(*) from ghh.organizations where id = $1)
            + (select count(*) from ghh.notes where org_id = $1)
            + (select count(*) from ghh.residents where org_id = $1)
            + (select count(*) from ghh.note_activities where org_id = $1)
            + (select count(*) from ghh.note_outcomes where org_id = $1)
            + (select count(*) from ghh.outcome_activities where org_id = $1)
            + (select count(*) from ghh.homes where org_id = $1)
            + (select count(*) from ghh.profiles where org_id = $1) as n`,
      [demoOrg]
    );
    check('the demo org leaves no child rows behind', Number(left.rows[0]?.n) === 0, String(left.rows[0]?.n));

    const trail = await db.query<{ n: number }>(
      `select count(*) as n from ghh.audit_log where action = 'resident.purge'`
    );
    check(
      'and the purge is recorded on the append-only audit log',
      Number(trail.rows[0]?.n) > 0,
      'the only remaining evidence of what was destroyed'
    );
  }

  // The real agency is untouched by any of it.
  const real = await db.query<{ n: number }>(
    'select count(*) as n from ghh.organizations where id = $1 and not is_demo',
    [ORG]
  );
  check('the real agency is still there', Number(real.rows[0]?.n) === 1);
}

/**
 * A prepared note cannot become a signed record on its own.
 *
 * Pre-staging creates a week of unsigned drafts carrying each resident's usual
 * pattern. That saves most of ten minutes a note, and it is only defensible
 * because of what it cannot do. All three of these are enforced by the
 * database, not by the route, so they hold against a caller that skips the app
 * entirely.
 */
async function checkPrestageGuarantees(db: PGlite) {
  console.log('\na prepared note cannot sign itself\n');

  const setup = await db.query<{ resident_id: string; home_id: string; shift_id: string; author_id: string; org_id: string }>(`
    with h as (
      insert into ghh.homes (org_id, name)
      values ('00000000-0000-0000-0000-000000000001', 'Prestage House') returning id, org_id
    ),
    s as (
      insert into ghh.shifts (org_id, home_id, label, start_time, end_time, sort_order)
      select org_id, id, '7AM-7PM', '07:00', '19:00', 0 from h returning id
    ),
    u as (insert into auth.users (email) values ('prestage@example.com') returning id),
    p as (
      insert into ghh.profiles (id, org_id, full_name, title, role)
      select u.id, h.org_id, 'Prestage DSP', 'DSP', 'dsp' from u, h returning id
    ),
    r as (
      insert into ghh.residents (org_id, home_id, first_name, last_name)
      select org_id, id, 'Robin', 'Prestage' from h returning id
    )
    select r.id as resident_id, h.id as home_id, s.id as shift_id, p.id as author_id, h.org_id
    from r, h, s, p`);

  const { resident_id, home_id, shift_id, author_id, org_id } = setup.rows[0];

  // `dateExpr` is SQL, inlined rather than bound, so the service date is
  // computed by the same clock the trigger compares it against. Test-only, and
  // never anything but a literal from this file.
  const prepare = async (dateExpr: string, confirmed: boolean) => {
    const row = await db.query<{ id: string }>(
      `insert into ghh.notes (org_id, template_id, template_version, resident_id, home_id,
                              shift_id, service_date, author_id, narrative,
                              prestaged_at, prestaged_by, prestage_confirmed_at)
       select $1, t.id, t.version, $2, $3, $4, ${dateExpr}, $5,
              'Prepared narrative the DSP wrote.', now(), $5,
              case when $6 then now() else null end
       from ghh.form_templates t limit 1
       returning id`,
      [org_id, resident_id, home_id, shift_id, author_id, confirmed]
    );
    return row.rows[0].id;
  };

  const sign = async (noteId: string) => {
    await db.query(
      `update ghh.notes
          set status = 'signed', signed_by = $2,
              signature_name = 'Prestage DSP', signature_title = 'DSP'
        where id = $1`,
      [noteId, author_id]
    );
  };

  const refuses = async (label: string, run: () => Promise<unknown>, detail?: string) => {
    let blocked = false;
    try {
      await run();
    } catch {
      blocked = true;
    }
    check(label, blocked, detail ?? 'the database let it through');
  };

  // 1. A day that has not happened cannot be attested to.
  const tomorrow = await prepare("ghh.org_today('00000000-0000-0000-0000-000000000001') + 3", true);
  await refuses(
    'a note for a future date cannot be signed, however it was prepared',
    () => sign(tomorrow),
    'somebody could attest to a shift nobody has worked'
  );

  await refuses(
    'and it cannot be inserted already signed either',
    () =>
      db.query(
        `insert into ghh.notes (org_id, template_id, template_version, resident_id, home_id,
                                shift_id, service_date, author_id, narrative, status, locked,
                                signed_at, signed_by, signature_name, signature_title)
         select $1, t.id, t.version, $2, $3, $4, (now() + interval '4 days')::date, $5,
                'Written ahead.', 'signed', true, now(), $5, 'Prestage DSP', 'DSP'
         from ghh.form_templates t limit 1`,
        [org_id, resident_id, home_id, shift_id, author_id]
      ),
    'the update trigger is not the only way in'
  );

  // 2. A prepared note has to be confirmed by a person first.
  const unconfirmed = await prepare("ghh.org_today('00000000-0000-0000-0000-000000000001')", false);
  await refuses(
    'a prepared note that nobody confirmed cannot be signed',
    () => sign(unconfirmed),
    'a guess from last week would have become an attested record'
  );

  await db.query('update ghh.notes set prestage_confirmed_at = now(), prestage_confirmed_by = $2 where id = $1', [
    unconfirmed,
    author_id
  ]);
  let signedOk = true;
  try {
    await sign(unconfirmed);
  } catch (err) {
    signedOk = false;
    check('once confirmed, it signs normally', false, (err as Error).message);
  }
  if (signedOk) check('once confirmed, it signs normally', true);

  // 3. The signing time is the database's, not the caller's.
  const backdated = await prepare("ghh.org_today('00000000-0000-0000-0000-000000000001') - 1", true);
  await db.query(
    `update ghh.notes
        set status = 'signed', signed_by = $2, signed_at = timestamptz '2020-01-01 00:00:00+00',
            signature_name = 'Prestage DSP', signature_title = 'DSP'
      where id = $1`,
    [backdated, author_id]
  );
  const when = await db.query<{ signed_at: string; backdated: boolean }>(
    `select signed_at, signed_at < now() - interval '1 day' as backdated
       from ghh.notes where id = $1`,
    [backdated]
  );
  check(
    'a supplied signing time is overwritten by the database clock',
    when.rows[0]?.backdated === false,
    `signed_at came back as ${when.rows[0]?.signed_at}`
  );

  // And the note it just signed is immutable like any other.
  await refuses(
    'a signed prepared note is as immutable as any other',
    () => db.query(`update ghh.notes set narrative = 'tampered' where id = $1`, [backdated])
  );

  // 4. Pre-staging answers no outcomes. The route writes no note_outcomes rows;
  //    this asserts the shape that makes that observable.
  const outcomes = await db.query<{ n: number }>(
    `select count(*) as n from ghh.note_outcomes o
      join ghh.notes n on n.id = o.note_id
     where n.prestaged_at is not null`
  );
  check(
    'no prepared note carries outcome documentation',
    Number(outcomes.rows[0]?.n) === 0,
    'pre-staging must never answer a service plan on the DSP’s behalf'
  );
}

// ---------------------------------------------------------------------------

/**
 * The snapshot, plus the one fact that makes it interpretable.
 *
 * `appliedThrough` is the last migration that has actually been deployed. Repo
 * and production are not the same thing between writing a migration and running
 * it, and a check that cannot express that either fails on every unmerged
 * change or has to be run only after deploys. So the comparison is made against
 * the migrations that were applied when the snapshot was taken, and anything
 * after that is reported as pending rather than as a defect — while still
 * having to apply cleanly and still having to pass the behavioural checks.
 */
type SnapshotFile = {
  appliedThrough: string;
  capturedAt: string;
  objects: Snapshot;
};

function readSnapshot(): SnapshotFile {
  return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) as SnapshotFile;
}

async function refresh() {
  const flag = process.argv.find((a) => a.startsWith('--applied-through='));
  const files = migrationFiles();
  const appliedThrough =
    flag?.split('=')[1] ??
    (fs.existsSync(SNAPSHOT) ? readSnapshot().appliedThrough : files[files.length - 1]);

  if (!files.includes(appliedThrough)) {
    console.error(`\n--applied-through must name a migration file. Got: ${appliedThrough}\n`);
    process.exit(1);
  }

  console.log('\nReading production structure (read-only, no row data)\n');
  const objects: Snapshot = {};
  for (const name of Object.keys(COMPARED)) {
    objects[name] = await readOnlyQuery<Row>(QUERIES[name]);
    console.log(`  ${name}: ${objects[name].length} row(s)`);
  }

  const file: SnapshotFile = {
    appliedThrough,
    capturedAt: new Date().toISOString(),
    objects
  };
  fs.writeFileSync(SNAPSHOT, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(process.cwd(), SNAPSHOT)} (applied through ${appliedThrough})\n`);
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

  const snapshot = readSnapshot();
  const all = migrationFiles();
  const cutoff = all.indexOf(snapshot.appliedThrough);

  if (cutoff === -1) {
    console.error(
      `\nThe snapshot was taken through ${snapshot.appliedThrough}, which no longer exists.\n` +
        'Refresh it, or restore the file.\n'
    );
    process.exit(1);
  }

  const deployed = all.slice(0, cutoff + 1);
  const pending = all.slice(cutoff + 1);

  // What production is running today has to be reproducible exactly.
  const { built, db } = await buildFromRepo(deployed, 'as deployed');
  compare(built, snapshot.objects);
  await db.close();

  // Everything, including migrations not yet run. These still have to apply to
  // a database in production's state, and the guarantees still have to hold
  // afterwards — that is what stops a pending migration quietly removing one.
  const full = await buildFromRepo(all, pending.length ? 'including pending' : 'complete');
  checkEveryTableIsProtected(full.built);
  await checkImmutabilityAndTheDemoDoor(full.db);
  await checkPrestageGuarantees(full.db);
  await full.db.close();

  if (pending.length) {
    console.log('\nnot yet deployed\n');
    for (const file of pending) console.log(`  pending  ${file}`);
    console.log('\n  These apply cleanly and keep every guarantee, but production has not run');
    console.log('  them yet. Re-run with --refresh --applied-through=<file> after deploying.');
  }

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
