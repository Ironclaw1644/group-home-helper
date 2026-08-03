import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { saveNoteActivities, saveNoteOutcomes } from '@/lib/outcomes/repo';

const OutcomeEntry = z.object({
  outcomeId: z.string().uuid(),
  addressed: z.boolean(),
  supportLevel: z
    .enum(['independent', 'verbal_prompt', 'gestural_prompt', 'hands_on', 'full_support'])
    .nullable(),
  progress: z.enum(['progressed', 'maintained', 'regressed', 'declined']).nullable(),
  comment: z.string().max(4000).nullable()
});

const ActivityEntry = z.object({
  activityId: z.string().uuid(),
  completed: z.boolean().nullable(),
  concern: z.boolean(),
  comment: z.string().max(4000).nullable()
});

const PatchBody = z.object({
  structuredData: z.record(z.unknown()),
  narrative: z.string().max(20000),
  // Outcome documentation autosaves alongside the chips: it is part of the same
  // note, not a separate record, and losing it on a dropped connection would
  // lose the part an auditor actually reads.
  outcomes: z.array(OutcomeEntry).max(60).optional(),
  activities: z.array(ActivityEntry).max(200).optional()
});

/**
 * Autosave a draft.
 *
 * RLS is what actually guards this: the update policy requires the caller to
 * be the author and the note to be unlocked, and 0003's trigger rejects any
 * write to a signed note regardless. The checks here exist to return a useful
 * status code rather than a bare RLS failure.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from('notes')
    .select('id, status, locked, author_id')
    .eq('id', id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  if (existing.locked || existing.status === 'signed') {
    return NextResponse.json(
      { error: 'This note is signed and cannot be edited. Add an addendum instead.' },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from('notes')
    .update({
      structured_data: parsed.data.structuredData,
      narrative: parsed.data.narrative
    })
    .eq('id', id)
    .select('id, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Could not save' }, { status: 400 });
  }

  if (parsed.data.outcomes?.length) {
    const saved = await saveNoteOutcomes(id, session.profile.orgId, parsed.data.outcomes);
    if ('error' in saved) {
      // The note body is already saved; say what did not persist rather than
      // reporting a clean save the DSP would trust.
      return NextResponse.json({ error: saved.error }, { status: 409 });
    }
  }

  if (parsed.data.activities?.length) {
    const saved = await saveNoteActivities(id, session.profile.orgId, parsed.data.activities);
    if ('error' in saved) {
      return NextResponse.json({ error: saved.error }, { status: 409 });
    }
  }

  return NextResponse.json({ ok: true, updatedAt: data.updated_at });
}

/**
 * Delete a draft.
 *
 * Drafts only. A signed note is a permanent record and the database refuses to
 * delete one regardless of what this route does — the check here exists to say
 * so in words rather than surfacing a constraint violation. The correction path
 * for a signed note is an addendum.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: note } = await supabase
    .from('notes')
    .select('id, status, locked, author_id')
    .eq('id', id)
    .maybeSingle();

  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

  if (note.locked || note.status === 'signed') {
    return NextResponse.json(
      {
        error:
          'This note is signed and is a permanent record. It cannot be deleted — add an addendum to correct it.'
      },
      { status: 409 }
    );
  }

  // The author or a supervisor. A DSP must not be able to discard someone
  // else's half-written shift.
  if (note.author_id !== session.profile.id && !isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only the person who started this note, or a supervisor, can discard it.' },
      { status: 403 }
    );
  }

  await supabase.from('note_activities').delete().eq('note_id', id);
  await supabase.from('note_outcomes').delete().eq('note_id', id);

  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not discard this note.' }, { status: 400 });

  return NextResponse.json({ ok: true });
}
