import { NextResponse } from 'next/server';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logAccess } from '@/lib/audit';

/**
 * Remove a staff member's access.
 *
 * Deactivates rather than deletes. Every note they signed carries their name
 * and title, and the audit log records what they opened — deleting the profile
 * would orphan both. Setting active = false makes getSession() refuse them,
 * so they cannot sign in at all while the record of their work stays intact.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can remove staff.' },
      { status: 403 }
    );
  }

  const { id } = await params;

  // Locking yourself out is a support ticket, not a feature.
  if (id === session.profile.id) {
    return NextResponse.json(
      { error: 'You cannot remove your own access. Ask another administrator.' },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();

  const { data: target } = await supabase
    .from('profiles')
    .select('id, role, full_name, active')
    .eq('id', id)
    .maybeSingle();

  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // A supervisor must not be able to remove an administrator; that is an
  // escalation route dressed up as staff management.
  if (target.role === 'admin' && session.profile.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only an administrator can remove another administrator.' },
      { status: 403 }
    );
  }

  // Refuse to remove the last administrator — the agency would be unable to
  // manage billing, staff, or plans ever again.
  if (target.role === 'admin') {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('active', true);

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'This is the only administrator. Promote someone else first.' },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAccess(supabase, req, 'staff.deactivate', 'profile', id, {
    name: target.full_name,
    role: target.role
  });

  return NextResponse.json({ ok: true });
}

/** Restore access for someone deactivated by mistake. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('profiles')
    .update({ active: true, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAccess(supabase, req, 'staff.reactivate', 'profile', id, {});
  return NextResponse.json({ ok: true });
}
