import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createOutcome } from '@/lib/outcomes/repo';
import { logAccess } from '@/lib/audit';

const OutcomeBody = z.object({
  residentId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  statement: z.string().trim().max(2000).nullable().optional(),
  supportStrategies: z.string().trim().max(4000).nullable().optional(),
  measure: z.string().trim().max(2000).nullable().optional(),
  frequency: z.string().trim().max(120).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // The plan is a clinical document. A DSP documenting against it must not be
  // able to reword what they are measured on.
  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can edit a service plan.' },
      { status: 403 }
    );
  }

  const parsed = OutcomeBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the fields and try again.' }, { status: 400 });
  }

  const result = await createOutcome(parsed.data, session.profile.orgId);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'outcome.create', 'resident', parsed.data.residentId, {
    outcome_id: result.id
  });

  return NextResponse.json({ id: result.id });
}
