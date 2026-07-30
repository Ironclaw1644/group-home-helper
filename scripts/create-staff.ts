/**
 * Create a staff account.
 *
 *   npm run staff:add -- <email> "<Full Name>" <dsp|supervisor|admin> [--demo]
 *
 * The password is generated and written to `.staff-credentials` with 0600
 * permissions rather than printed, for the same reason bootstrap:admin does it:
 * a printed password ends up in terminal scrollback, shell history files, CI
 * logs, and chat transcripts, and there is no taking it back.
 *
 * `--demo` overrides that and prints the password, for throwaway accounts used
 * to demo or train on the fictional resident. Never pass it for an account that
 * will touch a real resident's chart.
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const HOME_ID = '00000000-0000-0000-0000-000000000010';

const ROLES = ['dsp', 'supervisor', 'admin'] as const;
type Role = (typeof ROLES)[number];

const TITLES: Record<Role, string> = {
  dsp: 'DSP',
  supervisor: 'Supervisor',
  admin: 'Administrator'
};

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

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  console.error(`Missing env var: ${names.join(' or ')}`);
  process.exit(1);
}

function generatePassword(): string {
  // URL-safe and unambiguous, so it survives being read aloud over the phone.
  return randomBytes(18).toString('base64url');
}

async function main() {
  loadEnv();

  const args = process.argv.slice(2);
  const demo = args.includes('--demo');
  const [email, fullName, role] = args.filter((a) => a !== '--demo');

  if (!email || !fullName || !role) {
    console.error('Usage: npm run staff:add -- <email> "<Full Name>" <dsp|supervisor|admin> [--demo]');
    process.exit(1);
  }
  if (!ROLES.includes(role as Role)) {
    console.error(`Role must be one of: ${ROLES.join(', ')}`);
    process.exit(1);
  }

  const admin = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'),
    { db: { schema: 'ghh' }, auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: org } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', ORG_ID)
    .maybeSingle();

  if (!org) {
    console.error('Organization not found. Apply the migrations first.');
    process.exit(1);
  }

  const password = generatePassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (createError || !created.user) {
    // Supabase Auth is project-wide, so an address already used by another app
    // in the same project collides here even though this schema has no profile
    // for it. Plus-addressing (you+ahfs@…) gives a distinct identity.
    console.error(`Could not create the auth user: ${createError?.message ?? 'unknown error'}`);
    process.exit(1);
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    org_id: ORG_ID,
    full_name: fullName,
    title: TITLES[role as Role],
    role,
    active: true
  });

  if (profileError) {
    console.error(`Created the auth user but not the profile: ${profileError.message}`);
    console.error('Delete the auth user in the Supabase dashboard and re-run.');
    process.exit(1);
  }

  await admin.from('staff_homes').insert({ profile_id: created.user.id, home_id: HOME_ID });

  console.log(`\nCreated ${role} for ${org.name}`);
  console.log(`  name:  ${fullName}`);
  console.log(`  email: ${email}`);

  if (demo) {
    console.log(`  password: ${password}`);
    console.log('\nDEMO ACCOUNT — the password was printed because --demo was passed.');
    console.log('Delete this account before any real resident data is entered.\n');
    return;
  }

  const outFile = path.join(process.cwd(), '.staff-credentials');
  fs.appendFileSync(outFile, `${email}\t${password}\n`, { mode: 0o600 });
  fs.chmodSync(outFile, 0o600);
  console.log(`  password: written to ${outFile} (chmod 600, gitignored)\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
