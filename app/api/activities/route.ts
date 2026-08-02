import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const Body = z.object({
  outcomeId: z.string().uuid(),
  description: z.string().trim().min(1).max(400),
  measureType: z.enum(['routine', 'skill_building', 'health_safety']),
  measure: z.string().trim().max(600).nullable().optional(),
  supportInstructions: z.string().trim().max(4000).nullable().optional(),
  dailyQuestion: z.string().trim().max(300).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional()
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can edit a service plan.' },
      { status: 403 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the fields and try again.' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('outcome_activities')
    .insert({
      org_id: session.profile.orgId,
      outcome_id: parsed.data.outcomeId,
      description: parsed.data.description,
      measure_type: parsed.data.measureType,
      measure: parsed.data.measure || null,
      support_instructions: parsed.data.supportInstructions || null,
      // Default the daily question to the activity itself, phrased as one.
      daily_question:
        parsed.data.dailyQuestion ||
        `Did this happen? ${parsed.data.description}`.slice(0, 300),
      sort_order: parsed.data.sortOrder ?? 0
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ id: data.id });
}
