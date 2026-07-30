import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createResident, findPossibleDuplicate } from '@/lib/residents/repo';
import { logAccess } from '@/lib/audit';

const Pronouns = z.object({
  subject: z.string().min(1).max(12),
  object: z.string().min(1).max(12),
  possessive: z.string().min(1).max(12)
});

const ResidentBody = z.object({
  homeId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  preferredName: z.string().trim().max(80).nullable().optional(),
  room: z.string().trim().max(40).nullable().optional(),
  grouping: z.string().trim().max(60).nullable().optional(),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  pronouns: Pronouns,
  medicaidId: z.string().trim().max(40).nullable().optional(),
  /** Set once the supervisor has seen and dismissed a same-name warning. */
  allowDuplicate: z.boolean().default(false)
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // RLS is the real gate; this check exists to return a useful message rather
  // than a bare policy violation.
  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can add residents.' },
      { status: 403 }
    );
  }

  const parsed = ResidentBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the fields and try again.' },
      { status: 400 }
    );
  }
  const body = parsed.data;

  if (!body.allowDuplicate) {
    const existing = await findPossibleDuplicate(body.homeId, body.firstName, body.lastName);
    if (existing) {
      return NextResponse.json(
        {
          error: `${body.firstName} ${body.lastName} is already on this house's roster.`,
          duplicateOf: existing
        },
        { status: 409 }
      );
    }
  }

  const result = await createResident(body, session.profile.orgId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Creating a chart is an auditable event, same as viewing one.
  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'resident.create', 'resident', result.id, {
    home_id: body.homeId
  });

  return NextResponse.json({ id: result.id });
}
