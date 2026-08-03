import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getResident, updateResident } from '@/lib/residents/repo';
import { displayName } from '@/lib/types';
import { logAccess } from '@/lib/audit';

const Pronouns = z.object({
  subject: z.string().min(1).max(12),
  object: z.string().min(1).max(12),
  possessive: z.string().min(1).max(12)
});

const PatchBody = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  preferredName: z.string().trim().max(80).nullable().optional(),
  room: z.string().trim().max(40).nullable().optional(),
  grouping: z.string().trim().max(60).nullable().optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  homeId: z.string().uuid().optional(),
  pronouns: Pronouns.optional(),
  medicaidId: z.string().trim().max(40).nullable().optional(),
  active: z.boolean().optional(),
  dischargedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can edit residents.' },
      { status: 403 }
    );
  }

  const { id } = await params;

  const existing = await getResident(id);
  if (!existing) return NextResponse.json({ error: 'Resident not found' }, { status: 404 });

  // The demo resident is what training examples are written about. Renaming it
  // or turning off is_demo would put example notes into the billing export.
  if (existing.isDemo) {
    return NextResponse.json(
      { error: 'The training resident cannot be edited.' },
      { status: 403 }
    );
  }

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the fields and try again.' },
      { status: 400 }
    );
  }

  const result = await updateResident(id, parsed.data);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'resident.update', 'resident', id, {
    fields: Object.keys(parsed.data)
  });

  return NextResponse.json({ ok: true });
}

/**
 * Delete a resident added by mistake.
 *
 * Only when nothing has been documented about them. Once a note is signed the
 * person has a permanent record and the row must stay — the answer then is to
 * discharge them, which takes them off the roster without touching history.
 * Refusing loudly here is better than a cascade that quietly removes signed
 * documentation.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can remove a resident.' },
      { status: 403 }
    );
  }

  const { id } = await params;

  const resident = await getResident(id);
  if (!resident) return NextResponse.json({ error: 'Resident not found' }, { status: 404 });

  const supabase = await createSupabaseServerClient();

  const { count: noteCount } = await supabase
    .from('notes')
    .select('id', { count: 'exact', head: true })
    .eq('resident_id', id);

  if ((noteCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `${displayName(resident)} has ${noteCount} note${noteCount === 1 ? '' : 's'} on file and cannot be deleted. Mark them discharged instead — that removes them from the daily roster and keeps their records.`,
        reason: 'has_notes'
      },
      { status: 409 }
    );
  }

  // Plans and documents belong to nobody once the person is gone, and no note
  // references them, so they go too.
  const { data: outcomes } = await supabase
    .from('resident_outcomes')
    .select('id')
    .eq('resident_id', id);

  for (const outcome of outcomes ?? []) {
    await supabase.from('outcome_activities').delete().eq('outcome_id', outcome.id);
  }
  await supabase.from('resident_outcomes').delete().eq('resident_id', id);
  await supabase.from('documents').delete().eq('resident_id', id);

  const { error } = await supabase.from('residents').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await logAccess(supabase, req, 'resident.delete', 'resident', id, {
    name: `${resident.firstName} ${resident.lastName}`
  });

  return NextResponse.json({ ok: true });
}
