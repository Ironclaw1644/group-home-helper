import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateInviteCode } from './provision';
import type { StaffRole } from '@/lib/types';

/**
 * Invitation management for supervisors.
 *
 * These go through the caller's own client, so RLS decides whether they may
 * see or issue invitations for this org. Redemption is the opposite — it runs
 * with service_role in provision.ts, because the person redeeming has no
 * identity yet.
 */

const DEFAULT_LIFETIME_DAYS = 14;

export type Invitation = {
  id: string;
  code: string;
  role: StaffRole;
  title: string;
  homeId: string | null;
  email: string | null;
  expiresAt: string;
  maxUses: number;
  uses: number;
  revoked: boolean;
  createdAt: string;
  /** False once expired, revoked, or used up. */
  usable: boolean;
};

function toInvitation(r: Record<string, unknown>): Invitation {
  const expiresAt = r.expires_at as string;
  const uses = Number(r.uses ?? 0);
  const maxUses = Number(r.max_uses ?? 0);
  const revoked = Boolean(r.revoked);

  return {
    id: r.id as string,
    code: r.code as string,
    role: r.role as StaffRole,
    title: r.title as string,
    homeId: (r.home_id as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    expiresAt,
    maxUses,
    uses,
    revoked,
    createdAt: r.created_at as string,
    usable: !revoked && uses < maxUses && new Date(expiresAt).getTime() > Date.now()
  };
}

export async function listInvitations(): Promise<Invitation[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('invitations')
    .select('id, code, role, title, home_id, email, expires_at, max_uses, uses, revoked, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toInvitation);
}

export async function createInvitation(input: {
  orgId: string;
  homeId: string | null;
  role: StaffRole;
  title: string;
  email?: string | null;
  maxUses?: number;
  lifetimeDays?: number;
  createdBy: string;
}): Promise<{ code: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const expiresAt = new Date(
    Date.now() + (input.lifetimeDays ?? DEFAULT_LIFETIME_DAYS) * 24 * 60 * 60 * 1000
  ).toISOString();

  const code = generateInviteCode();

  const { error } = await supabase.from('invitations').insert({
    org_id: input.orgId,
    home_id: input.homeId,
    code,
    role: input.role,
    title: input.title,
    email: input.email?.trim() || null,
    // A single-person invitation should not stay open after they use it.
    max_uses: input.email?.trim() ? 1 : (input.maxUses ?? 25),
    expires_at: expiresAt,
    created_by: input.createdBy
  });

  if (error) {
    if (error.code === '42501') {
      return { error: 'Only a supervisor or administrator can invite staff.' };
    }
    return { error: error.message };
  }

  return { code };
}

export async function revokeInvitation(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('invitations').update({ revoked: true }).eq('id', id);

  if (error) {
    if (error.code === '42501') {
      return { error: 'Only a supervisor or administrator can revoke invitations.' };
    }
    return { error: error.message };
  }
  return { ok: true };
}

export type StaffMember = {
  id: string;
  fullName: string;
  title: string;
  role: StaffRole;
  active: boolean;
};

export async function listStaff(): Promise<StaffMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, title, role, active')
    .order('full_name');

  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    fullName: r.full_name as string,
    title: r.title as string,
    role: r.role as StaffRole,
    active: Boolean(r.active)
  }));
}
