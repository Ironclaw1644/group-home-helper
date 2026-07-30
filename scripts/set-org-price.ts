/**
 * Put an agency on a specific Stripe price.
 *
 *   npm run billing:set-price -- <org-id|name> <price_id> "reason"
 *   npm run billing:set-price -- --list
 *
 * Negotiated rates are normal from the first customer onward, so they live in
 * the database rather than in a deploy — changing what someone pays should not
 * require a release. Existing subscribers are unaffected: Stripe bills whatever
 * price their subscription was created with, so a change here applies to the
 * next checkout, not retroactively.
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './load-env';

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

  const args = process.argv.slice(2);

  if (args[0] === '--list' || args.length === 0) {
    const { data } = await admin
      .from('organizations')
      .select('id, name, stripe_price_id, subscription_status, billing_note, is_demo')
      .eq('is_demo', false)
      .order('name');

    console.log('\nAgencies\n');
    for (const org of data ?? []) {
      console.log(`  ${org.name}`);
      console.log(`    id:     ${org.id}`);
      console.log(`    price:  ${org.stripe_price_id ?? '(public price)'}`);
      console.log(`    status: ${org.subscription_status}`);
      if (org.billing_note) console.log(`    note:   ${org.billing_note}`);
      console.log('');
    }
    console.log('Set one with:  npm run billing:set-price -- <org-id> <price_id> "reason"\n');
    return;
  }

  const [target, priceId, ...noteParts] = args;
  if (!target || !priceId) {
    console.error('Usage: npm run billing:set-price -- <org-id|name> <price_id> "reason"');
    process.exit(1);
  }

  if (!priceId.startsWith('price_')) {
    console.error(`"${priceId}" does not look like a Stripe price id.`);
    process.exit(1);
  }

  // Accept an id or a name, since nobody remembers a uuid.
  const isUuid = /^[0-9a-f-]{36}$/i.test(target);
  const lookup = admin.from('organizations').select('id, name');
  const { data: orgs } = isUuid
    ? await lookup.eq('id', target)
    : await lookup.ilike('name', `%${target}%`);

  if (!orgs || orgs.length === 0) {
    console.error(`No agency matched "${target}".`);
    process.exit(1);
  }
  if (orgs.length > 1) {
    console.error(`"${target}" matched ${orgs.length} agencies:`);
    for (const o of orgs) console.error(`  ${o.name} (${o.id})`);
    process.exit(1);
  }

  const org = orgs[0];
  const note = noteParts.join(' ') || null;

  const { error } = await admin
    .from('organizations')
    .update({ stripe_price_id: priceId, billing_note: note })
    .eq('id', org.id);

  if (error) {
    console.error(`Could not update: ${error.message}`);
    process.exit(1);
  }

  console.log(`\n${org.name} is now on ${priceId}`);
  if (note) console.log(`  reason: ${note}`);
  console.log('\nApplies to their next checkout. An existing subscription keeps its');
  console.log('current price until it is changed in Stripe.\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
