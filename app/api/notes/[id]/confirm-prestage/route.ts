import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logAccess } from '@/lib/audit';

/**
 * Confirm that a prepared note's entries describe the shift that was worked.
 *
 * Pre-staging fills a draft in from the resident's routine, which is a guess.
 * A guess is a fine starting point and an indefensible record, so the database
 * refuses to sign a prepared note until this has been called — this is the
 * moment a person takes ownership of what is on the screen.
 *
 * Timestamped by the server, on the DSP's own session, so the confirmation is
 * attributable and cannot be predated along with everything else the pre-stage
 * wrote.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: note } = await supabase
    .from('notes')
    .select('id, status, locked, prestaged_at, prestage_confirmed_at')
    .eq('id', id)
    .maybeSingle();

  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  if (note.locked || note.status === 'signed') {
    return NextResponse.json({ error: 'This note is already signed.' }, { status: 409 });
  }
  if (!note.prestaged_at) {
    return NextResponse.json(
      { error: 'This note was not prepared in advance, so there is nothing to confirm.' },
      { status: 400 }
    );
  }
  // Already confirmed is not an error — the DSP tapped twice, or two tabs are
  // open. Report the state rather than a failure.
  if (note.prestage_confirmed_at) {
    return NextResponse.json({ ok: true, confirmedAt: note.prestage_confirmed_at });
  }

  const confirmedAt = new Date().toISOString();

  const { error } = await supabase
    .from('notes')
    .update({ prestage_confirmed_at: confirmedAt, prestage_confirmed_by: session.profile.id })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'Could not record the confirmation.' }, { status: 400 });
  }

  await logAccess(supabase, req, 'note.prestage_confirm', 'note', id, {});

  return NextResponse.json({ ok: true, confirmedAt });
}
