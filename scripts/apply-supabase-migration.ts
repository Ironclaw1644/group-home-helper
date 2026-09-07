/**
 * Apply one migration file to the linked Supabase project.
 *
 *   npm run db:apply -- supabase/migrations/0020_week_prestage.sql
 *   npm run db:apply -- supabase/migrations/0020_week_prestage.sql --check
 *
 * The hosted project drifts behind supabase/migrations, and when it does the
 * app fails in a way that looks like an application bug — a 500 on the note
 * editor whose real cause is a column that was never added. This exists so
 * closing that gap is one command with a record of what it ran, rather than a
 * paste into a web SQL editor that nothing remembers.
 *
 * Credentials: the project ref comes from NEXT_PUBLIC_SUPABASE_URL in
 * .env.local and the bearer token from the Supabase CLI's own login at
 * ~/.supabase/access-token. Neither is read into a variable that is printed,
 * logged, or included in an error message — the only thing this reports is the
 * project's name and what the statements did.
 *
 * `--check` runs nothing. It reports whether the migration appears to have
 * been applied already, by looking for the columns and routines it defines.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const API = 'https://api.supabase.com/v1';

async function token(): Promise<string> {
  const raw = (await readFile(path.join(homedir(), '.supabase', 'access-token'), 'utf8')).trim();
  // The CLI has stored this as bare text and as JSON at different versions.
  if (raw.startsWith('{')) {
    const parsed = JSON.parse(raw) as { access_token?: string };
    if (!parsed.access_token) throw new Error('no access_token in ~/.supabase/access-token');
    return parsed.access_token;
  }
  return raw;
}

async function projectRef(): Promise<string> {
  const env = await readFile(path.join(process.cwd(), '.env.local'), 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('NEXT_PUBLIC_SUPABASE_URL='));
  if (!line) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set in .env.local');

  const url = line.slice('NEXT_PUBLIC_SUPABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\./.exec(url)?.[1];
  if (!ref) throw new Error('could not read a project ref out of NEXT_PUBLIC_SUPABASE_URL');
  return ref;
}

/** Run SQL through the Management API. Errors never carry the request headers. */
async function query(ref: string, bearer: string, sql: string): Promise<unknown[]> {
  const res = await fetch(`${API}/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql })
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`Supabase returned ${res.status}: ${body.slice(0, 500)}`);
  return JSON.parse(body) as unknown[];
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const file = args.find((a) => a.endsWith('.sql'));
  if (!file) throw new Error('pass a path to a .sql migration');

  const [bearer, ref] = await Promise.all([token(), projectRef()]);

  const meta = (await query(
    ref,
    bearer,
    'select current_database() as db, current_user as role'
  )) as Array<{ db: string; role: string }>;
  console.log(`connected to ${ref} · database ${meta[0]?.db} · as ${meta[0]?.role}`);

  const present = (await query(
    ref,
    bearer,
    `select column_name from information_schema.columns
      where table_schema = 'ghh' and table_name = 'notes'
        and column_name like 'prestage%'
      order by column_name`
  )) as Array<{ column_name: string }>;

  console.log(
    present.length
      ? `prestage columns already present: ${present.map((c) => c.column_name).join(', ')}`
      : 'prestage columns: none'
  );

  if (check) return;

  const sql = await readFile(path.resolve(file), 'utf8');
  console.log(`\napplying ${file} …`);
  await query(ref, bearer, sql);

  const after = (await query(
    ref,
    bearer,
    `select column_name from information_schema.columns
      where table_schema = 'ghh' and table_name = 'notes'
        and column_name like 'prestage%'
      order by column_name`
  )) as Array<{ column_name: string }>;

  console.log(`done. prestage columns now: ${after.map((c) => c.column_name).join(', ') || 'none'}`);
}

main().catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
