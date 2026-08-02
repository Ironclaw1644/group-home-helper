import { NextResponse } from 'next/server';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Retire an activity.
 *
 * Deactivated rather than deleted: signed notes carry answers against it, and
 * a deleted activity would leave those answers pointing at nothing.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('outcome_activities')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
