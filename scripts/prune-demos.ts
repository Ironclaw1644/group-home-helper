/**
 * Delete expired demo sandboxes.
 *
 *   npm run demo:prune
 *
 * Every demo visitor gets their own org, so without this they accumulate
 * forever. Deletion cascades from ghh.organizations, and the function only ever
 * selects rows flagged is_demo — a real agency cannot be caught by it.
 *
 * Run it on a schedule if demos see real traffic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = line.slice(i + 1).trim();
  }
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing Supabase config in .env.local');
    process.exit(1);
  }

  const admin = createClient(url, key, {
    db: { schema: 'ghh' },
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { count: before } = await admin
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .eq('is_demo', true);

  const { data, error } = await admin.rpc('prune_expired_demos');
  if (error) {
    console.error(`Prune failed: ${error.message}`);
    process.exit(1);
  }

  console.log(`Demo orgs before: ${before ?? 0}`);
  console.log(`Removed:          ${data ?? 0}`);

  // The auth users behind pruned demos are orphaned by the cascade, so clear
  // them too. Only ever the generated demo addresses.
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  let orphaned = 0;
  for (const user of users?.users ?? []) {
    if (!user.email?.endsWith('@demo.invalid')) continue;
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile) {
      await admin.auth.admin.deleteUser(user.id).catch(() => {});
      orphaned++;
    }
  }
  console.log(`Orphaned demo accounts removed: ${orphaned}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
