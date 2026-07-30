/**
 * Architecture probe for the desktop build.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/probe-pglite.ts
 *
 * PGlite would let the desktop app embed Postgres with no subprocess, no
 * per-platform binaries, and no Docker. Attractive — but only if the three
 * things this app's security actually rests on survive the move:
 *
 *   1. pgcrypto, for encrypting Medicaid IDs at rest.
 *   2. RLS enforcement. PGlite connects as a superuser, and superusers hold
 *      BYPASSRLS, which defeats even FORCE ROW LEVEL SECURITY. The question is
 *      whether SET ROLE to an unprivileged role restores enforcement.
 *   3. BEFORE triggers, which is how signed notes are made immutable.
 *
 * If any of these fail, the desktop build ships real Postgres binaries instead.
 */
import { PGlite } from '@electric-sql/pglite';
// PGlite ships contrib extensions as separate modules that must be registered
// on the constructor; `create extension` alone is not enough.
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.waitReady;

  const version = await db.query<{ version: string }>('select version()');
  console.log(`\n${version.rows[0].version}\n`);

  // -------------------------------------------------------------------------
  console.log('1. pgcrypto (Medicaid ID encryption)');
  // -------------------------------------------------------------------------
  let pgcryptoOk = false;
  try {
    await db.exec('create extension if not exists pgcrypto;');
    const r = await db.query<{ round_trip: string }>(
      `select pgp_sym_decrypt(pgp_sym_encrypt('109016522050', 'test-key'), 'test-key') as round_trip`
    );
    pgcryptoOk = r.rows[0].round_trip === '109016522050';
    check('pgcrypto loads and round-trips pgp_sym_encrypt/decrypt', pgcryptoOk);
  } catch (err) {
    check('pgcrypto loads', false, err instanceof Error ? err.message : String(err));
  }

  // gen_random_uuid lives in pgcrypto on older PG, core on newer.
  try {
    const r = await db.query<{ id: string }>('select gen_random_uuid() as id');
    check('gen_random_uuid() available', typeof r.rows[0].id === 'string');
  } catch (err) {
    check('gen_random_uuid() available', false, err instanceof Error ? err.message : String(err));
  }

  // -------------------------------------------------------------------------
  console.log('\n2. Row Level Security under SET ROLE');
  // -------------------------------------------------------------------------
  await db.exec(`
    create schema if not exists ghh;

    create table ghh.notes (
      id serial primary key,
      home_id int not null,
      body text not null
    );

    insert into ghh.notes (home_id, body) values (1, 'house one'), (2, 'house two');

    -- Mirrors the real policy shape: a session variable stands in for
    -- auth.uid(), since there is no GoTrue in the desktop build.
    create or replace function ghh.current_home() returns int
      language sql stable
      as $$ select nullif(current_setting('app.home_id', true), '')::int $$;

    alter table ghh.notes enable row level security;
    alter table ghh.notes force row level security;

    create policy notes_read on ghh.notes
      for select using (home_id = ghh.current_home());

    -- The unprivileged role the app runs its queries as.
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'ghh_app') then
        create role ghh_app nologin;
      end if;
    end $$;

    grant usage on schema ghh to ghh_app;
    grant select, insert, update, delete on ghh.notes to ghh_app;
    grant usage, select on all sequences in schema ghh to ghh_app;
    grant execute on function ghh.current_home() to ghh_app;
  `);

  // Superuser: expected to bypass RLS entirely.
  const asSuper = await db.query<{ n: number }>('select count(*)::int as n from ghh.notes');
  check(
    'superuser bypasses RLS (so the app must NOT query as superuser)',
    asSuper.rows[0].n === 2,
    `saw ${asSuper.rows[0].n} rows`
  );

  // Unprivileged role with a session variable: RLS should scope the result.
  await db.exec(`set role ghh_app; select set_config('app.home_id', '1', false);`);
  const asAppHome1 = await db.query<{ n: number }>('select count(*)::int as n from ghh.notes');
  check(
    'SET ROLE + session variable scopes reads to one home',
    asAppHome1.rows[0].n === 1,
    `saw ${asAppHome1.rows[0].n} rows, expected 1`
  );

  await db.exec(`select set_config('app.home_id', '2', false);`);
  const asAppHome2 = await db.query<{ body: string }>('select body from ghh.notes');
  check(
    'switching the session variable switches the visible rows',
    asAppHome2.rows.length === 1 && asAppHome2.rows[0].body === 'house two',
    JSON.stringify(asAppHome2.rows)
  );

  // No session variable set at all: must see nothing, not everything.
  await db.exec(`select set_config('app.home_id', '', false);`);
  const asAppNone = await db.query<{ n: number }>('select count(*)::int as n from ghh.notes');
  check(
    'an unset session variable yields zero rows (fails closed)',
    asAppNone.rows[0].n === 0,
    `saw ${asAppNone.rows[0].n} rows`
  );

  await db.exec('reset role;');

  // -------------------------------------------------------------------------
  console.log('\n3. BEFORE triggers (signed-note immutability)');
  // -------------------------------------------------------------------------
  await db.exec(`
    alter table ghh.notes add column locked boolean not null default false;

    create or replace function ghh.enforce_immutable() returns trigger
      language plpgsql as $$
      begin
        if old.locked then
          raise exception 'note % is signed and cannot be modified', old.id
            using errcode = 'restrict_violation';
        end if;
        return new;
      end $$;

    create trigger notes_immutable before update on ghh.notes
      for each row execute function ghh.enforce_immutable();

    update ghh.notes set locked = true where id = 1;
  `);

  let blocked = false;
  try {
    await db.exec(`update ghh.notes set body = 'tampered' where id = 1;`);
  } catch (err) {
    blocked = err instanceof Error && /cannot be modified/.test(err.message);
  }
  check('a locked row rejects UPDATE, even as superuser', blocked);

  let unlockedOk = false;
  try {
    await db.exec(`update ghh.notes set body = 'edited' where id = 2;`);
    const r = await db.query<{ body: string }>('select body from ghh.notes where id = 2');
    unlockedOk = r.rows[0].body === 'edited';
  } catch {
    unlockedOk = false;
  }
  check('an unlocked row still updates normally', unlockedOk);

  // -------------------------------------------------------------------------
  console.log('\n4. Persistence to disk');
  // -------------------------------------------------------------------------
  try {
    const disk = new PGlite('./tmp/pglite-probe', { extensions: { pgcrypto } });
    await disk.waitReady;
    await disk.exec(`create table if not exists t (v text); insert into t values ('persisted');`);
    await disk.close();

    const reopened = new PGlite('./tmp/pglite-probe', { extensions: { pgcrypto } });
    await reopened.waitReady;
    const r = await reopened.query<{ v: string }>('select v from t');
    check('data survives close and reopen', r.rows[0]?.v === 'persisted');
    await reopened.close();
  } catch (err) {
    check('data survives close and reopen', false, err instanceof Error ? err.message : String(err));
  }

  await db.close();

  console.log(
    failures === 0
      ? '\nPGlite is viable for the desktop build.\n'
      : `\n${failures} check(s) failed — ship real Postgres binaries instead.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
