import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Home, Profile, StaffRole } from '@/lib/types';

export type Session = {
  userId: string;
  email: string | null;
  profile: Profile;
  homes: Home[];
};

/**
 * Load the signed-in user's profile and assigned homes.
 *
 * Cached per request so a page that checks the session in several places does
 * not re-query. Returns null when signed out, or when an auth user exists but
 * has no active profile — an invited account nobody finished setting up should
 * see nothing, not everything.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('id, org_id, full_name, title, role, active')
    .eq('id', user.id)
    .maybeSingle();

  if (!profileRow || !profileRow.active) return null;

  const profile: Profile = {
    id: profileRow.id,
    orgId: profileRow.org_id,
    fullName: profileRow.full_name,
    title: profileRow.title,
    role: profileRow.role as StaffRole,
    active: profileRow.active
  };

  // RLS already restricts this to homes the user may see, so no extra filter
  // is needed here: supervisors get the whole org, DSPs get their assignments.
  const { data: homeRows } = await supabase
    .from('homes')
    .select('id, org_id, name')
    .eq('active', true)
    .order('name');

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    homes: (homeRows ?? []).map((h) => ({ id: h.id, orgId: h.org_id, name: h.name }))
  };
});

/** Require a signed-in, provisioned user. Redirects to login otherwise. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

/** Require supervisor or admin. Sends DSPs back to their roster. */
export async function requireSupervisor(): Promise<Session> {
  const session = await requireSession();
  if (session.profile.role === 'dsp') redirect('/');
  return session;
}

export function isSupervisor(profile: Profile): boolean {
  return profile.role === 'supervisor' || profile.role === 'admin';
}

/** The org's timezone drives what "today" means on the roster. */
export function orgTimeZone(): string {
  return process.env.NEXT_PUBLIC_ORG_TIMEZONE || 'America/New_York';
}
