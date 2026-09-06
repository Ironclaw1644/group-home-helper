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

/**
 * Last-resort timezone.
 *
 * `NEXT_PUBLIC_ORG_TIMEZONE` is honoured for a single-tenant self-hosted
 * install that has one agency and never set the column. It is a fallback only:
 * on a shared install the org's own row decides, because a process-wide
 * timezone silently files a Pacific night shift under tomorrow's service date.
 */
function fallbackTimeZone(): string {
  const configured = process.env.NEXT_PUBLIC_ORG_TIMEZONE;
  return isValidTimeZone(configured) ? (configured as string) : 'America/New_York';
}

/**
 * An unusable timezone must not take the roster down.
 *
 * `organizations.timezone` is written from the browser's own
 * `Intl.DateTimeFormat().resolvedOptions()` at signup, so it is caller-supplied
 * and can also go stale after an IANA rename. `DateTimeFormat` throws
 * RangeError on a name it does not know, and that would 500 the home page
 * rather than mis-date a single note.
 */
export function isValidTimeZone(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The same lookup for a known org id, for routes that already have one. */
export const orgTimeZoneFor = cache(async (orgId: string): Promise<string> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('organizations')
      .select('timezone')
      .eq('id', orgId)
      .maybeSingle();

    return isValidTimeZone(data?.timezone) ? (data!.timezone as string) : fallbackTimeZone();
  } catch {
    return fallbackTimeZone();
  }
});

/**
 * The organization's timezone — what "today" means for this agency.
 *
 * Cached per request, so the roster, the compliance panel and a PDF render in
 * one request share a single lookup. Every service-date boundary in the app
 * goes through here: a shift written at 22:00 in Los Angeles belongs to that
 * calendar day in Los Angeles, not to whatever day it already is in UTC.
 */
export const orgTimeZone = cache(async (): Promise<string> => {
  const session = await getSession();
  if (!session) return fallbackTimeZone();
  return orgTimeZoneFor(session.profile.orgId);
});
