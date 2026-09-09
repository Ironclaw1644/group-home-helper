/**
 * Delete demo sandboxes.
 *
 *   npm run demo:prune                      list what would go (dry run)
 *   npm run demo:prune -- --confirm         remove every expired sandbox
 *   npm run demo:prune -- --all --confirm   remove every sandbox, expired or not
 *
 * The demo endpoint now sweeps expired sandboxes itself, so this is for the
 * backlog and for the case where nobody has opened the demo in a while.
 *
 * It shares one implementation with that endpoint
 * (lib/onboarding/demo-reaper.ts), which is the point. The previous version
 * called `ghh.prune_expired_demos()`, which does a plain delete and relies on
 * the cascade — but the cascade reaches signed notes and 0003 refuses to delete
 * those, so every run raised, removed nothing, and sixteen dead demo orgs piled
 * up in production behind it. Deletion now goes through `ghh.purge_resident()`,
 * the one audited door built for exactly this.
 *
 * A dry run by default, and only ever rows flagged `is_demo`. This database
 * holds real PHI for a real agency and shares an instance with unrelated
 * businesses in other schemas, so the tool is built to be boring.
 */
import { loadEnv } from './load-env';

loadEnv();

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const all = args.includes('--all');

  // Imported after loadEnv: the admin client reads its configuration at module
  // load, and a static import would run before the file has been read.
  const { createSupabaseAdminClient } = await import('../lib/supabase/admin');
  const { listExpiredDemoOrgs, purgeDemoOrg, reapOrphanedDemoAccounts } = await import(
    '../lib/onboarding/demo-reaper'
  );

  const admin = createSupabaseAdminClient();

  // Only ever a demo org, on either branch.
  const targets = all
    ? (
        (await admin.from('organizations').select('id, name').eq('is_demo', true)).data ?? []
      ).map((o) => ({ id: o.id as string, name: o.name as string }))
    : await listExpiredDemoOrgs(admin);

  const { count: realOrgs } = await admin
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .eq('is_demo', false);

  console.log(`\nDemo organizations to remove: ${targets.length}`);
  console.log(`Real organizations, never touched: ${realOrgs ?? 0}\n`);

  if (targets.length === 0) {
    console.log('Nothing to do.\n');
    return;
  }

  for (const org of targets) {
    const { count: notes } = await admin
      .from('notes')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org.id);
    const { count: residents } = await admin
      .from('residents')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org.id);
    console.log(`  ${org.id}  ${org.name} — ${residents ?? 0} resident(s), ${notes ?? 0} note(s)`);
  }

  if (!confirm) {
    console.log('\nDry run. Re-run with --confirm to remove these.\n');
    return;
  }

  console.log('');
  let removed = 0;
  for (const org of targets) {
    const result = await purgeDemoOrg(org.id);
    if (result) {
      removed++;
      console.log(
        `  removed  ${result.name} — ${result.residents} resident(s), ${result.notes} note(s), ${result.signedNotes} signed`
      );
    } else {
      console.log(`  FAILED   ${org.id} — left in place`);
    }
  }

  // purgeDemoOrg used to do this itself, once per org, which meant walking the
  // whole auth user list again for every org in the batch. It runs once here
  // instead, after everything above has gone.
  if (removed > 0) {
    const accounts = await reapOrphanedDemoAccounts();
    if (accounts > 0) console.log(`  removed  ${accounts} orphaned demo account(s)`);
  }

  console.log(`\nRemoved ${removed} of ${targets.length} demo organization(s).\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
