/**
 * Remove one organization and everything belonging to it.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/purge-org.ts --name "ZZ AUDIT DELETE ME"
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/purge-org.ts --id <uuid> --confirm
 *
 * Written for the test org an audit left in the production database, and kept
 * because that will happen again.
 *
 * This database is shared with unrelated businesses in other schemas and holds
 * real PHI for real agencies, so the tool is built to be boring: it refuses to
 * act on a name, only on an id the operator has copied from a dry run; it
 * prints a full inventory before touching anything; and it never widens its own
 * scope. Deletion cascades from ghh.organizations, but storage objects and auth
 * users are outside the database and are cleared explicitly.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadEnv } from './load-env';

/**
 * Every table that can hold a row belonging to an org.
 *
 * `documents`, `note_activities` and `outcome_activities` are live in
 * production but have no `create table` in supabase/migrations, so their
 * cascade behaviour cannot be read from the repo. They are counted before and
 * after for exactly that reason.
 */
const ORG_SCOPED = [
  'notes',
  'note_addenda',
  'note_outcomes',
  'note_activities',
  'residents',
  'resident_outcomes',
  'outcome_activities',
  'documents',
  'shifts',
  'homes',
  'staff_homes',
  'invitations',
  'profiles',
  'ai_generations',
  'audit_log',
  'form_templates'
] as const;

const BUCKETS = ['ghh-documents', 'ghh-signatures'];

type Counts = Record<string, number | string>;

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

/**
 * Count an org's rows in one table.
 *
 * Most tables carry org_id. staff_homes does not — it joins profiles to homes —
 * so it is counted through the org's own home ids.
 */
async function countFor(
  admin: SupabaseClient,
  table: string,
  orgId: string,
  homeIds: string[]
): Promise<number | string> {
  try {
    if (table === 'staff_homes') {
      if (homeIds.length === 0) return 0;
      const { count, error } = await admin
        .from(table)
        .select('home_id', { count: 'exact', head: true })
        .in('home_id', homeIds);
      return error ? `err: ${error.message}` : (count ?? 0);
    }

    const { count, error } = await admin
      .from(table)
      .select('org_id', { count: 'exact', head: true })
      .eq('org_id', orgId);
    return error ? `err: ${error.message}` : (count ?? 0);
  } catch (err) {
    return `err: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function inventory(
  admin: SupabaseClient,
  orgId: string,
  homeIds: string[]
): Promise<Counts> {
  const counts: Counts = {};
  for (const table of ORG_SCOPED) {
    counts[table] = await countFor(admin, table, orgId, homeIds);
  }
  return counts;
}

/** Every object under an org's prefix, across both private buckets. */
async function listStorage(admin: SupabaseClient, orgId: string): Promise<string[]> {
  const found: string[] = [];

  for (const bucket of BUCKETS) {
    const walk = async (prefix: string, depth: number): Promise<void> => {
      if (depth > 4) return;
      const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
      if (error || !data) return;
      for (const entry of data) {
        const full = prefix ? `${prefix}/${entry.name}` : entry.name;
        // A folder placeholder has no id; a real object does.
        if (entry.id) found.push(`${bucket}/${full}`);
        else await walk(full, depth + 1);
      }
    };
    await walk(orgId, 0);
  }

  return found;
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

  const wantName = arg('--name');
  const wantId = arg('--id');
  const confirm = process.argv.includes('--confirm');

  if (!wantName && !wantId) {
    console.error('Give --name "Exact Org Name" to look one up, or --id <uuid> to act on one.');
    process.exit(1);
  }

  // --- Identify -----------------------------------------------------------
  let query = admin
    .from('organizations')
    .select('id, name, legal_name, is_demo, created_via, created_at');
  query = wantId ? query.eq('id', wantId) : query.eq('name', wantName!);

  const { data: orgs, error } = await query;
  if (error) {
    console.error(`Lookup failed: ${error.message}`);
    process.exit(1);
  }
  if (!orgs || orgs.length === 0) {
    console.log('No organization matched. Nothing to do.');
    return;
  }
  if (orgs.length > 1) {
    console.error(`${orgs.length} organizations matched. Re-run with --id to pick one:`);
    for (const o of orgs) console.error(`  ${o.id}  ${o.name}`);
    process.exit(1);
  }

  const org = orgs[0];
  console.log('\nOrganization');
  console.log(`  id          ${org.id}`);
  console.log(`  name        ${org.name}`);
  console.log(`  legal_name  ${org.legal_name ?? '—'}`);
  console.log(`  is_demo     ${org.is_demo}`);
  console.log(`  created_via ${org.created_via ?? '—'}`);
  console.log(`  created_at  ${org.created_at}`);

  const { data: homes } = await admin.from('homes').select('id, name').eq('org_id', org.id);
  const homeIds = (homes ?? []).map((h) => h.id as string);

  const { data: profiles } = await admin.from('profiles').select('id, full_name, role').eq('org_id', org.id);

  console.log('\nRows that belong to it');
  const before = await inventory(admin, org.id as string, homeIds);
  for (const [table, n] of Object.entries(before)) {
    console.log(`  ${table.padEnd(20)} ${n}`);
  }

  const objects = await listStorage(admin, org.id as string);
  console.log(`\nStorage objects under ${org.id}/`);
  if (objects.length === 0) console.log('  none');
  for (const o of objects) console.log(`  ${o}`);

  console.log('\nAuth accounts attached to it');
  if (!profiles || profiles.length === 0) console.log('  none');
  for (const p of profiles) console.log(`  ${p.id}  ${p.full_name} (${p.role})`);

  if (!confirm) {
    console.log('\nDRY RUN — nothing was changed.');
    console.log(`Re-run with:  --id ${org.id} --confirm\n`);
    return;
  }

  // --- Delete -------------------------------------------------------------
  console.log('\nDeleting.');

  // Storage first. If the database row goes first and this fails, the objects
  // are orphaned with no row left to find them from.
  for (const bucket of BUCKETS) {
    const paths = objects
      .filter((o) => o.startsWith(`${bucket}/`))
      .map((o) => o.slice(bucket.length + 1));
    if (paths.length === 0) continue;
    const { error: rmError } = await admin.storage.from(bucket).remove(paths);
    console.log(`  ${bucket}: removed ${paths.length}${rmError ? ` (error: ${rmError.message})` : ''}`);
  }

  // Auth users next, for the same reason: profiles is how they are found.
  for (const p of profiles ?? []) {
    const { error: userError } = await admin.auth.admin.deleteUser(p.id as string);
    console.log(`  auth user ${p.id}${userError ? ` (error: ${userError.message})` : ' removed'}`);
  }

  const { error: delError } = await admin.from('organizations').delete().eq('id', org.id);
  if (delError) {
    console.error(`\nOrganization delete failed: ${delError.message}`);
    process.exit(1);
  }
  console.log('  organization row removed (children cascade)');

  // --- Verify -------------------------------------------------------------
  console.log('\nLeft behind');
  const after = await inventory(admin, org.id as string, homeIds);
  let leftovers = 0;
  for (const [table, n] of Object.entries(after)) {
    const bad = typeof n === 'number' && n > 0;
    if (bad) leftovers += n;
    console.log(`  ${table.padEnd(20)} ${n}${bad ? '   <-- ORPHANED' : ''}`);
  }

  const objectsAfter = await listStorage(admin, org.id as string);
  console.log(`  storage objects      ${objectsAfter.length}${objectsAfter.length ? '   <-- ORPHANED' : ''}`);

  const { data: orgAfter } = await admin.from('organizations').select('id').eq('id', org.id).maybeSingle();
  console.log(`  organization row     ${orgAfter ? 'STILL PRESENT' : 'gone'}`);

  if (leftovers > 0 || objectsAfter.length > 0 || orgAfter) {
    console.error('\nSomething survived. Investigate before assuming this is clean.\n');
    process.exit(1);
  }
  console.log('\nClean.\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
