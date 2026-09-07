/**
 * Report which of the recent migrations the hosted project has actually run.
 *
 *   npm run db:state
 *
 * `verify:schema` tracks deployment against `appliedThrough` in
 * supabase/schema-snapshot.json, which is a note somebody has to keep
 * accurate by hand. This asks the database instead, so the note can be
 * corrected from fact rather than from memory.
 *
 * Read-only. Credentials are read the same way as db:apply and are never
 * printed.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const API = 'https://api.supabase.com/v1';

/** Each probe is a yes/no question about one migration's visible effect. */
const PROBES: Array<{ migration: string; question: string; sql: string }> = [
  {
    migration: '0019_drop_broken_demo_prune.sql',
    question: 'ghh.prune_expired_demos() is gone',
    sql: `select not exists (
            select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'ghh' and p.proname = 'prune_expired_demos'
          ) as ok`
  },
  {
    migration: '0020_week_prestage.sql',
    question: 'ghh.notes has the prestage columns',
    sql: `select count(*) = 4 as ok from information_schema.columns
          where table_schema = 'ghh' and table_name = 'notes'
            and column_name in
              ('prestaged_at','prestaged_by','prestage_confirmed_at','prestage_confirmed_by')`
  },
  {
    migration: '0021_staff_homes_read_org_scope.sql',
    question: 'staff_homes_read is scoped to the caller’s own agency',
    // The policy narrows via ghh.home_in_my_org(home_id) rather than by naming
    // org_id inline, so that helper is what to look for. Checking for the
    // string 'org_id' matches nothing and reports a applied migration as
    // missing.
    sql: `select coalesce(bool_or(qual::text ilike '%home_in_my_org%'), false) as ok
          from pg_policies
          where schemaname = 'ghh' and tablename = 'staff_homes'
            and policyname = 'staff_homes_read'`
  }
];

async function bearer(): Promise<string> {
  const raw = (await readFile(path.join(homedir(), '.supabase', 'access-token'), 'utf8')).trim();
  return raw.startsWith('{') ? (JSON.parse(raw) as { access_token: string }).access_token : raw;
}

async function projectRef(): Promise<string> {
  const env = await readFile(path.join(process.cwd(), '.env.local'), 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('NEXT_PUBLIC_SUPABASE_URL='));
  if (!line) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set in .env.local');
  const url = line.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\./.exec(url)?.[1];
  if (!ref) throw new Error('could not read a project ref out of NEXT_PUBLIC_SUPABASE_URL');
  return ref;
}

async function main() {
  const [token, ref] = await Promise.all([bearer(), projectRef()]);

  console.log(`project ${ref}\n`);

  for (const probe of PROBES) {
    const res = await fetch(`${API}/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: probe.sql })
    });

    if (!res.ok) throw new Error(`Supabase returned ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const rows = (await res.json()) as Array<{ ok: boolean }>;
    const ok = rows[0]?.ok === true;
    console.log(`  ${ok ? 'applied' : 'MISSING'}  ${probe.migration}`);
    console.log(`            ${probe.question}`);
  }
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
