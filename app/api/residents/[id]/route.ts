import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getResident, updateResident } from '@/lib/residents/repo';
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
