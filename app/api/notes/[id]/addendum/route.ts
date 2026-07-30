import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { logAccess } from '@/lib/audit';

const AddendumBody = z.object({
  body: z.string().trim().min(3).max(10000)
});

/**
 * Append a correction to a signed note.
 *
 * This is the only way to change what a signed note says. The note row itself
 * is never touched — 0003 makes that impossible at the database level.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;

  const parsed = AddendumBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Write the addendum before signing it.' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: note } = await supabase
    .from('notes')
    .select('id, org_id, status')
    .eq('id', id)
    .maybeSingle();

  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  if (note.status !== 'signed') {
    return NextResponse.json(
      { error: 'Addenda apply to signed notes. Edit the draft directly instead.' },
      { status: 409 }
    );
  }

  const { error } = await supabase.from('note_addenda').insert({
    org_id: note.org_id,
    note_id: id,
    author_id: session.profile.id,
    body: parsed.data.body,
    signature_name: session.profile.fullName,
    signature_title: session.profile.title
  });

  if (error) {
    console.error('[addendum] insert failed', error);
    return NextResponse.json({ error: 'Could not add the addendum.' }, { status: 400 });
  }

  await logAccess(supabase, req, 'note.addendum', 'note', id);

  return NextResponse.json({ ok: true });
}
