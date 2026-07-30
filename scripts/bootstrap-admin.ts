/**
 * Create the first admin account.
 *
 *   npm run bootstrap:admin -- admin@example.com "Jane Doe"
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
 * environment. Run it once after applying the migrations; from then on staff
 * are added through the app.
 *
 * A temporary password is generated and written to `.admin-credentials` with
 * 0600 permissions rather than printed. Printing it would put a live credential
 * into whatever terminal log, CI output, or chat transcript ran the command;
 * the file is gitignored and meant to be deleted once the password is changed.
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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

  // Written, not printed — see the note at the top of this file.
  const outFile = path.join(process.cwd(), '.admin-credentials');
  fs.writeFileSync(
    outFile,
    [
      `# Created ${new Date().toISOString()} for ${org.name}`,
      '# One-time password. Sign in, change it, then delete this file.',
      `email=${email}`,
      `password=${password}`,
      ''
    ].join('\n'),
    { mode: 0o600 }
  );

  console.log(`\nCreated admin for ${org.name}`);
  console.log(`  email:       ${email}`);
  console.log(`  credentials: ${outFile}  (chmod 600, gitignored)`);
  console.log('\nRead the password from that file, sign in, change it, then delete the file.\n');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
