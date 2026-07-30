/**
 * Create the first admin account.
 *
 *   npm run bootstrap:admin -- admin@example.com "Jane Doe"
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
 * environment. Run it once after applying the migrations; from then on staff
 * are added through the app.
 *
 * A temporary password is generated and printed. It is a one-time credential
 * meant to be changed on first sign-in — nothing else is ever printed, and no
 * secret from the environment is echoed.
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const HOME_ID = '00000000-0000-0000-0000-000000000010';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function generatePassword(): string {
  // URL-safe, no ambiguous characters to misread over the phone.
  return randomBytes(18).toString('base64url');
}

async function main() {
  const [email, fullName] = process.argv.slice(2);
  if (!email || !fullName) {
    console.error('Usage: npm run bootstrap:admin -- <email> "<Full Name>"');
    process.exit(1);
  }

  const admin = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { db: { schema: 'ghh' }, auth: { autoRefreshToken: false, persistSession: false } }
  );

  // The seed migration must have run first — the profile references it.
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', ORG_ID)
    .maybeSingle();

  if (orgError || !org) {
    console.error('Organization not found. Apply the migrations in supabase/migrations first.');
    process.exit(1);
  }

  const password = generatePassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (createError || !created.user) {
    console.error(`Could not create the auth user: ${createError?.message ?? 'unknown error'}`);
    process.exit(1);
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    org_id: ORG_ID,
    full_name: fullName,
    title: 'Administrator',
    role: 'admin',
    active: true
  });

  if (profileError) {
    console.error(`Created the auth user but could not create the profile: ${profileError.message}`);
    console.error('Delete the auth user in the Supabase dashboard and re-run.');
    process.exit(1);
  }

  // Admins see every home in the org through RLS, but an explicit assignment
  // keeps the roster page from having to special-case them.
  await admin.from('staff_homes').insert({ profile_id: created.user.id, home_id: HOME_ID });

  console.log(`\nCreated admin for ${org.name}`);
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log('\nSign in and change this password immediately.\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
