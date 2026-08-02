import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getResident } from '@/lib/residents/repo';
import { VIRGINIA_OUTCOME_LIBRARY, personalize } from '@/lib/outcomes/virginia-library';
import { logAccess } from '@/lib/audit';
import { displayName } from '@/lib/types';

const Body = z.object({
  residentId: z.string().uuid(),
  keys: z.array(z.string()).min(1).max(20)
});

/**
 * Install starter outcomes for a resident.
 *
 * These are a drafting aid, not a plan. They land as ordinary editable rows so
 * a supervisor rewrites them in the person's own words — a template outcome is
 * by definition not person-centered, which is the whole point in Virginia.
 */
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
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const resident = await getResident(parsed.data.residentId);
  if (!resident) return NextResponse.json({ error: 'Resident not found' }, { status: 404 });

  const name = displayName(resident);
  const fill = (t: string) => personalize(t, name, resident.pronouns);

  const supabase = await createSupabaseServerClient();
  const chosen = VIRGINIA_OUTCOME_LIBRARY.filter((o) => parsed.data.keys.includes(o.key));
  let installed = 0;

  for (const [index, template] of chosen.entries()) {
    const { data: outcome, error } = await supabase
      .from('resident_outcomes')
      .insert({
        org_id: session.profile.orgId,
        resident_id: resident.id,
        title: template.title,
        statement: fill(template.statement),
        important_to: template.importantTo,
        important_for: template.importantFor ?? null,
        frequency: template.frequency,
        lens: template.lens,
        sort_order: index
      })
      .select('id')
      .single();

    if (error || !outcome) continue;
    installed++;

    await supabase.from('outcome_activities').insert(
      template.activities.map((a, i) => ({
        org_id: session.profile.orgId,
        outcome_id: outcome.id,
        description: fill(a.description),
        measure_type: a.measureType,
        measure: fill(a.measure),
        support_instructions: fill(a.supportInstructions),
        daily_question: fill(a.dailyQuestion),
        sort_order: i
      }))
    );
  }

  await logAccess(supabase, req, 'outcome.install_library', 'resident', resident.id, {
    installed
  });

  return NextResponse.json({ installed });
}
