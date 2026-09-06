import 'server-only';

import { randomBytes, randomUUID } from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { personalize } from '@/lib/outcomes/library';
import type { LibraryOutcome } from '@/lib/types';
import { seedDemoHistory } from './demo-history';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '@/lib/auth/password';

/**
 * Account provisioning: invites, new agencies, and demo sandboxes.
 *
 * Everything here runs with service_role, because the person being provisioned
 * has no profile yet and therefore no RLS identity to act under. That makes
 * this file the security boundary for public sign-up — every function must
 * establish for itself that the caller is entitled to what it is about to
 * create, since the database will not do it for them.
 */

/** Long enough that guessing is not a strategy; short enough to read aloud. */
const CODE_BYTES = 12;

/** Demo sandboxes disappear after this. Long enough to actually try it. */
const DEMO_LIFETIME_HOURS = 48;

/**
 * Ceiling on demo orgs created per hour, across everyone.
 *
 * Public endpoints that create auth users are an abuse target. This is a real
 * limit because it is a database count rather than a per-instance counter —
 * serverless would give each cold start its own in-memory tally, which is no
 * limit at all.
 */
const DEMO_ORGS_PER_HOUR = 40;

export type ProvisionResult =
  | { ok: true; userId: string; orgId: string; email: string }
  | { ok: false; error: string };

/**
 * A URL-safe join code.
 *
 * Generated with a CSPRNG rather than anything derived from the org, the date,
 * or a counter: this string is the only thing between a stranger and an
 * agency's roster, so it must not be reconstructible from public information.
 */
export function generateInviteCode(): string {
  return randomBytes(CODE_BYTES).toString('base64url');
}

/**
 * Turn a Supabase auth error into something a person can act on.
 *
 * The duplicate-email case needs saying plainly: auth is project-wide, so an
 * address registered by an unrelated app in the same project collides here even
 * though this schema has never seen it.
 */
function authErrorMessage(message: string): string {
  if (/already been registered|already registered|already exists/i.test(message)) {
    return 'That email address is already in use. Sign in instead, or use a different address.';
  }
  if (/password/i.test(message)) {
    return `That password was rejected. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return 'Could not create the account. Check the details and try again.';
}

// ---------------------------------------------------------------------------
// Invitations — joining an existing agency
// ---------------------------------------------------------------------------

export type InviteDetails = {
  id: string;
  orgId: string;
  orgName: string;
  homeId: string | null;
  homeName: string | null;
  role: 'dsp' | 'supervisor' | 'admin';
  title: string;
  /** When set, only this address may redeem. */
  email: string | null;
};

/**
 * Look up a join code.
 *
 * Deliberately returns the same null for "no such code", "expired", "revoked",
 * and "used up". A visitor probing codes learns only that the one they tried
 * does not work, not whether it ever existed.
 */
export async function validateInvite(code: string): Promise<InviteDetails | null> {
  if (!code || code.length > 64) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('invitations')
    .select('id, org_id, home_id, role, title, email, expires_at, max_uses, uses, revoked')
    .eq('code', code)
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  if (data.uses >= data.max_uses) return null;

  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', data.org_id)
    .maybeSingle();

  let homeName: string | null = null;
  if (data.home_id) {
    const { data: home } = await admin
      .from('homes')
      .select('name')
      .eq('id', data.home_id)
      .maybeSingle();
    homeName = home?.name ?? null;
  }

  return {
    id: data.id,
    orgId: data.org_id,
    orgName: org?.name ?? 'your agency',
    homeId: data.home_id,
    homeName,
    role: data.role,
    title: data.title,
    email: data.email
  };
}

export async function redeemInvite(input: {
  code: string;
  email: string;
  password: string;
  fullName: string;
}): Promise<ProvisionResult> {
  const invite = await validateInvite(input.code);
  if (!invite) {
    return { ok: false, error: 'That invitation link is not valid any more. Ask for a new one.' };
  }

  // An invitation addressed to one person is not a link to pass around.
  if (invite.email && invite.email.toLowerCase() !== input.email.trim().toLowerCase()) {
    return { ok: false, error: `This invitation was issued to ${invite.email}.` };
  }

  const pwProblem = passwordProblem(input.password);
  if (pwProblem) return { ok: false, error: pwProblem };

  const admin = createSupabaseAdminClient();

  // Holding a valid code is the authorization, so the address does not need
  // separate email confirmation to prove anything.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    email_confirm: true
  });

  if (createError || !created.user) {
    return { ok: false, error: authErrorMessage(createError?.message ?? '') };
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    org_id: invite.orgId,
    full_name: input.fullName.trim(),
    title: invite.title,
    role: invite.role,
    active: true
  });

  if (profileError) {
    // Leaving an auth user with no profile would be an account that can sign in
    // and see nothing, with no way to fix itself.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { ok: false, error: 'Could not finish setting up the account. Try again.' };
  }

  if (invite.homeId) {
    await admin.from('staff_homes').insert({
      profile_id: created.user.id,
      home_id: invite.homeId
    });
  }

  // Best-effort: a miscounted use is better than a failed join for someone who
  // was legitimately invited.
  const { data: current } = await admin
    .from('invitations')
    .select('uses')
    .eq('id', invite.id)
    .maybeSingle();
  await admin
    .from('invitations')
    .update({ uses: (current?.uses ?? 0) + 1 })
    .eq('id', invite.id);

  return { ok: true, userId: created.user.id, orgId: invite.orgId, email: input.email.trim() };
}

// ---------------------------------------------------------------------------
// New agencies
// ---------------------------------------------------------------------------

const DEFAULT_SHIFTS = [
  { label: '7AM-7PM', start_time: '07:00', end_time: '19:00', crosses_midnight: false, sort_order: 1 },
  { label: '7PM-7AM', start_time: '19:00', end_time: '07:00', crosses_midnight: true, sort_order: 2 }
];

/** Create the org, its first house, its shifts, and the admin who owns it. */
export async function createAgency(input: {
  orgName: string;
  homeName: string;
  email: string;
  password: string;
  fullName: string;
  timezone?: string;
}): Promise<ProvisionResult> {
  const pwProblem = passwordProblem(input.password);
  if (pwProblem) return { ok: false, error: pwProblem };

  const admin = createSupabaseAdminClient();

  // Create the account first. If the address is taken, nothing has been written
  // yet and there is no half-built agency to clean up.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email.trim(),
    password: input.password,
    email_confirm: true
  });

  if (createError || !created.user) {
    return { ok: false, error: authErrorMessage(createError?.message ?? '') };
  }

  const cleanup = async () => {
    await admin.auth.admin.deleteUser(created.user!.id).catch(() => {});
  };

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({
      name: input.orgName.trim(),
      timezone: input.timezone || 'America/New_York',
      created_via: 'signup'
    })
    .select('id')
    .single();

  if (orgError || !org) {
    await cleanup();
    return { ok: false, error: 'Could not create the agency. Try again.' };
  }

  const { data: home, error: homeError } = await admin
    .from('homes')
    .insert({ org_id: org.id, name: input.homeName.trim() || 'Main House' })
    .select('id')
    .single();

  if (homeError || !home) {
    await admin.from('organizations').delete().eq('id', org.id);
    await cleanup();
    return { ok: false, error: 'Could not create the house. Try again.' };
  }

  await admin
    .from('shifts')
    .insert(DEFAULT_SHIFTS.map((s) => ({ ...s, org_id: org.id, home_id: home.id })));

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    org_id: org.id,
    full_name: input.fullName.trim(),
    title: 'Administrator',
    role: 'admin',
    active: true
  });

  if (profileError) {
    await admin.from('organizations').delete().eq('id', org.id);
    await cleanup();
    return { ok: false, error: 'Could not finish setting up the account. Try again.' };
  }

  await admin.from('staff_homes').insert({ profile_id: created.user.id, home_id: home.id });

  return { ok: true, userId: created.user.id, orgId: org.id, email: input.email.trim() };
}

// ---------------------------------------------------------------------------
// Demo sandboxes
// ---------------------------------------------------------------------------

/**
 * Fictional residents, written to exercise the parts of the app that matter:
 * different pronoun sets, a preferred name that differs from the legal one, and
 * rooms to sort by. None of these people exist.
 */
const DEMO_RESIDENTS = [
  {
    first_name: 'Alexander',
    last_name: 'Sample',
    preferred_name: 'Alex',
    room: '1A',
    grouping: 'North Hall',
    pronoun_subject: 'he',
    pronoun_object: 'him',
    pronoun_possessive: 'his',
    medicaid_id_demo: '100000000000'
  },
  {
    first_name: 'Maria',
    last_name: 'Example',
    preferred_name: null,
    room: '2B',
    grouping: 'North Hall',
    pronoun_subject: 'she',
    pronoun_object: 'her',
    pronoun_possessive: 'her',
    medicaid_id_demo: '100000000001'
  },
  {
    first_name: 'Jordan',
    last_name: 'Placeholder',
    preferred_name: 'JP',
    room: '3',
    grouping: 'South Hall',
    pronoun_subject: 'they',
    pronoun_object: 'them',
    pronoun_possessive: 'their',
    medicaid_id_demo: '100000000002'
  }
];

/**
 * The starter outcome library for an organization's jurisdiction.
 *
 * Provisioning runs before anyone is signed in, so it cannot use the
 * session-scoped resolver in lib/notes/repo.ts. It applies the same precedence
 * — the org's own template, else a global one for its jurisdiction, else
 * GENERIC — through the SQL function that defines that rule once.
 */
async function libraryForOrg(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string
): Promise<LibraryOutcome[]> {
  const { data } = await admin.rpc('template_for_org', { p_org_id: orgId });
  const row = Array.isArray(data) ? data[0] : data;
  const schema = (row?.schema ?? {}) as { outcome_library?: LibraryOutcome[] };
  return schema.outcome_library ?? [];
}

/**
 * Install service plans on the demo residents.
 *
 * Two or three outcomes each, taken from different parts of the library so the
 * demo shows the range rather than the same plan three times. Which library
 * that is depends on the demo org's jurisdiction, exactly as it would for a
 * paying customer.
 */
async function seedDemoPlans(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
  residents: Array<{
    id: string;
    first_name: string;
    preferred_name: string | null;
    pronoun_subject: string;
    pronoun_object: string;
    pronoun_possessive: string;
  }>
): Promise<void> {
  const library = await libraryForOrg(admin, orgId);
  if (library.length === 0) return;

  // Different slices per resident so the plans do not read identically.
  // Built from whatever keys this jurisdiction's library actually has rather
  // than from a hardcoded list of Virginia's, so a demo in another state still
  // gets plans instead of three empty residents.
  const keys = library.map((o) => o.key);
  const slices = [0, 1, 2].map((offset) =>
    [0, 1, 2]
      .map((i) => keys[(offset + i * 2) % keys.length])
      .filter((k, i, all) => all.indexOf(k) === i)
      .slice(0, offset === 1 ? 2 : 3)
  );

  for (const [index, resident] of residents.entries()) {
    const chosen = slices[index % slices.length];
    const name = resident.preferred_name?.trim() || resident.first_name;
    const pronouns = {
      subject: resident.pronoun_subject,
      object: resident.pronoun_object,
      possessive: resident.pronoun_possessive
    };
    const fill = (t: string) => personalize(t, name, pronouns);

    for (const [order, key] of chosen.entries()) {
      const template = library.find((o) => o.key === key);
      if (!template) continue;

      const { data: outcome } = await admin
        .from('resident_outcomes')
        .insert({
          org_id: orgId,
          resident_id: resident.id,
          title: template.title,
          statement: fill(template.statement),
          important_to: template.importantTo,
          important_for: template.importantFor ?? null,
          frequency: template.frequency,
          lens: template.lens,
          sort_order: order
        })
        .select('id')
        .single();

      if (!outcome) continue;

      await admin.from('outcome_activities').insert(
        template.activities.map((a, i) => ({
          org_id: orgId,
          outcome_id: outcome.id,
          description: fill(a.description),
          measure_type: a.measureType,
          measure: fill(a.measure),
          support_instructions: fill(a.supportInstructions),
          daily_question: fill(a.dailyQuestion),
          sort_order: i
        }))
      );
    }
  }
}

/** True when demo creation should be refused for now. */
async function demoQuotaExceeded(): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count, error } = await admin
    .from('organizations')
    .select('id', { count: 'exact', head: true })
    .eq('is_demo', true)
    .gte('created_at', since);

  if (error) return false;
  return (count ?? 0) >= DEMO_ORGS_PER_HOUR;
}

/**
 * Provision a throwaway sandbox and return credentials to sign in with.
 *
 * Each visitor gets their own org, so one person's demo notes are invisible to
 * the next — which also means nothing anyone types here can be seen by anyone
 * else. The org carries is_demo and an expiry, so pruning it later is
 * unambiguous and can never catch a real agency.
 */
export async function createDemoSandbox(): Promise<
  ProvisionResult & { password?: string }
> {
  if (await demoQuotaExceeded()) {
    return {
      ok: false,
      error: 'A lot of demos have started in the last hour. Please try again shortly.'
    };
  }

  const admin = createSupabaseAdminClient();
  const id = randomUUID();
  const email = `demo-${id}@demo.invalid`;
  const password = randomBytes(18).toString('base64url');

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (createError || !created.user) {
    return { ok: false, error: 'Could not start a demo right now. Try again shortly.' };
  }

  const cleanup = async () => {
    await admin.auth.admin.deleteUser(created.user!.id).catch(() => {});
  };

  const expiresAt = new Date(Date.now() + DEMO_LIFETIME_HOURS * 60 * 60 * 1000).toISOString();

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({
      name: 'Demo Agency',
      timezone: 'America/New_York',
      is_demo: true,
      expires_at: expiresAt,
      created_via: 'demo'
    })
    .select('id')
    .single();

  if (orgError || !org) {
    await cleanup();
    return { ok: false, error: 'Could not start a demo right now. Try again shortly.' };
  }

  const { data: home, error: homeError } = await admin
    .from('homes')
    .insert({ org_id: org.id, name: 'Demo House' })
    .select('id')
    .single();

  if (homeError || !home) {
    await admin.from('organizations').delete().eq('id', org.id);
    await cleanup();
    return { ok: false, error: 'Could not start a demo right now. Try again shortly.' };
  }

  await admin
    .from('shifts')
    .insert(DEFAULT_SHIFTS.map((s) => ({ ...s, org_id: org.id, home_id: home.id })));

  const { data: createdResidents } = await admin
    .from('residents')
    .insert(
      DEMO_RESIDENTS.map((r) => ({
        ...r,
        org_id: org.id,
        home_id: home.id,
        // Every resident in a demo is fictional, which is what keeps demo notes
        // out of any billing export.
        is_demo: true,
        active: true
      }))
    )
    .select('id, first_name, preferred_name, pronoun_subject, pronoun_object, pronoun_possessive');

  // Give each demo resident a real service plan.
  //
  // Without this a visitor opens a note, sees the generic chips, and never
  // discovers the part that makes this different from a form — the outcomes
  // the note documents against. An empty demo undersells the product to
  // exactly the person deciding whether to pay for it.
  await seedDemoPlans(admin, org.id, createdResidents ?? []);

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    org_id: org.id,
    full_name: 'Demo User',
    // Admin so the visitor can see every screen, including the supervisor
    // dashboard and resident management.
    title: 'Administrator',
    role: 'admin',
    active: true
  });

  if (profileError) {
    await admin.from('organizations').delete().eq('id', org.id);
    await cleanup();
    return { ok: false, error: 'Could not start a demo right now. Try again shortly.' };
  }

  await admin.from('staff_homes').insert({ profile_id: created.user.id, home_id: home.id });

  // Two weeks of signed notes, so the quarterly review and the compliance watch
  // have something to show. Without history the features that best justify the
  // price render empty to the person evaluating them.
  //
  // Failures here are swallowed: a demo with plans but no history is still
  // worth having, and a visitor should never see setup fail.
  try {
    const { data: template } = await admin
      .from('form_templates')
      .select('id, version')
      .eq('active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: dayShift } = await admin
      .from('shifts')
      .select('id')
      .eq('home_id', home.id)
      .order('sort_order')
      .limit(1)
      .maybeSingle();

    if (template && dayShift && createdResidents?.length) {
      await seedDemoHistory(admin, {
        orgId: org.id,
        homeId: home.id,
        shiftId: dayShift.id,
        templateId: template.id,
        templateVersion: template.version,
        authorId: created.user.id,
        residents: createdResidents
      });
    }
  } catch (err) {
    console.error('[demo] could not seed history', err);
  }

  return { ok: true, userId: created.user.id, orgId: org.id, email, password };
}
