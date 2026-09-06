/**
 * Read the live `ghh` schema, read-only, so the repo can be checked against it.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/live-schema.ts <query-name>
 *
 * Why this exists: migrations 0007 and 0008 are missing from
 * supabase/migrations/, 0016 is comments with no SQL, and several live tables
 * were created out of band through the Supabase dashboard. The repo therefore
 * could not rebuild the database, and "does every table have an RLS policy?"
 * was not answerable from source. Reconstructing that DDL means reading what is
 * actually there.
 *
 * Two hard rules, because this schema holds PHI and shares a Postgres instance
 * with unrelated businesses:
 *
 *   1. **Statements are checked to be read-only before they are sent.** Nothing
 *      here may create, alter, or drop anything. The reconstruction is a
 *      description of production, never a change to it.
 *   2. **It reads structure, never rows.** No resident, note, or audit content
 *      is fetched, so nothing this prints can contain PHI.
 *
 * The Management API token is read from the Supabase CLI's own login file and
 * passed in a header. It is never logged, never placed in argv, and never
 * written anywhere.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnv } from './load-env';

loadEnv();

const TOKEN_FILE = path.join(os.homedir(), '.supabase', 'access-token');

/** Only statements that cannot change anything. */
const READ_ONLY = /^\s*(select|with)\b/i;
const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|comment\s+on|refresh)\b/i;

export function projectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  const ref = new URL(url).hostname.split('.')[0];
  if (!ref) throw new Error('Could not read the project ref from NEXT_PUBLIC_SUPABASE_URL');
  return ref;
}

function token(): string {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error(
      'No Supabase CLI login found. Run `supabase login` first — this script never asks for a token.'
    );
  }
  return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
}

/**
 * Run one read-only statement against the live database.
 *
 * Refuses anything that is not a bare SELECT/WITH. This is a guard against a
 * careless edit to this file, not against a determined caller — but a careless
 * edit is the realistic risk when the target is a shared production instance.
 */
export async function readOnlyQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!READ_ONLY.test(sql) || FORBIDDEN.test(sql)) {
    throw new Error(`Refusing to send a statement that is not plainly read-only:\n${sql}`);
  }

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef()}/database/query`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token()}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ query: sql, read_only: true })
    }
  );

  if (!res.ok) {
    // The body can echo the statement but never the token.
    throw new Error(`Management API ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T[];
}

// ---------------------------------------------------------------------------
// Introspection queries. Structure only — no table here contains note content.
// ---------------------------------------------------------------------------

export const QUERIES: Record<string, string> = {
  tables: `
    select c.relname as name,
           c.relrowsecurity as rls_enabled,
           c.relforcerowsecurity as rls_forced,
           obj_description(c.oid) as comment
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'ghh' and c.relkind in ('r','v','m')
    order by c.relkind, c.relname`,

  columns: `
    select table_name, ordinal_position, column_name, data_type,
           udt_name, is_nullable, column_default, character_maximum_length
    from information_schema.columns
    where table_schema = 'ghh'
    order by table_name, ordinal_position`,

  constraints: `
    select rel.relname as table_name,
           con.conname as name,
           con.contype as type,
           pg_get_constraintdef(con.oid) as definition
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'ghh'
      -- contype 'n' is a NOT NULL constraint materialised as a catalog row.
      -- Postgres 17 does that and 15 does not, so including them would report
      -- a difference between two servers that agree completely. Nullability is
      -- compared properly through information_schema.columns.is_nullable.
      and con.contype <> 'n'
    order by rel.relname, con.contype, con.conname`,

  indexes: `
    select tablename as table_name, indexname as name, indexdef as definition
    from pg_indexes
    where schemaname = 'ghh'
    order by tablename, indexname`,

  policies: `
    select tablename as table_name, policyname as name, cmd, permissive,
           roles::text as roles, qual, with_check
    from pg_policies
    where schemaname = 'ghh'
    order by tablename, policyname`,

  triggers: `
    select rel.relname as table_name,
           tg.tgname as name,
           pg_get_triggerdef(tg.oid) as definition
    from pg_trigger tg
    join pg_class rel on rel.oid = tg.tgrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'ghh' and not tg.tgisinternal
    order by rel.relname, tg.tgname`,

  functions: `
    select p.proname as name,
           pg_get_function_identity_arguments(p.oid) as args,
           pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'ghh'
    order by p.proname`,

  grants: `
    select table_name, grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'ghh'
    order by table_name, grantee, privilege_type`,

  buckets: `
    select id, name, public, file_size_limit, allowed_mime_types::text
    from storage.buckets
    where id like 'ghh%' or name like 'ghh%'
    order by id`,

  /** Row counts only — a count is not content. Used to spot unused tables. */
  counts: `
    select relname as table_name, n_live_tup as approx_rows
    from pg_stat_user_tables
    where schemaname = 'ghh'
    order by relname`
};

async function main() {
  const which = process.argv[2];
  if (!which || !QUERIES[which]) {
    console.error(`Usage: live-schema.ts <${Object.keys(QUERIES).join('|')}>`);
    process.exit(1);
  }
  const rows = await readOnlyQuery(QUERIES[which]);
  console.log(JSON.stringify(rows, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith('live-schema.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
