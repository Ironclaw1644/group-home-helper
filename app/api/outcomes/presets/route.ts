import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getResident } from '@/lib/residents/repo';
import { createPreset } from '@/lib/outcomes/presets';
import { draftTexts, findNames } from '@/lib/outcomes/depersonalize';
import { logAccess } from '@/lib/audit';

const Activity = z.object({
  description: z.string().trim().min(1).max(2000),
  measureType: z.enum(['routine', 'skill_building', 'health_safety']),
  measure: z.string().trim().max(2000),
  supportInstructions: z.string().trim().max(4000),
  dailyQuestion: z.string().trim().max(500)
});

const Body = z.object({
  /**
   * The resident this wording came from. Not stored — it is here so the server
   * can check the submitted text against that person's own name before writing
   * a row every one of their colleagues can read.
   */
  sourceResidentId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  // Agency-defined free text. Not an enum, and not validated against a list:
  // the grouping belongs to the agency, not to this app.
  category: z.string().trim().max(80).nullable().optional(),
  lens: z.enum(['independence', 'integration', 'quality_of_life']).nullable().optional(),
  importantTo: z.string().trim().max(2000).nullable().optional(),
  importantFor: z.string().trim().max(2000).nullable().optional(),
  statement: z.string().trim().max(2000).nullable().optional(),
  frequency: z.string().trim().max(120).nullable().optional(),
  activities: z.array(Activity).max(20).default([])
});

/**
 * Save an outcome the agency already wrote as a reusable preset.
 *
 * A preset is org-wide: every colleague can read it, including staff with no
 * access to the home the wording came from. So the text arrives de-personalized
 * — `{name}` and the pronoun placeholders — and this route checks it again
 * before writing. The browser did the substitution and the supervisor edited
 * the result, which means the browser's check is advice and this one is the
 * control.
 *
 * A preset is a drafting aid like every other starter outcome here. It says
 * nothing about what any plan should contain.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can save a preset.' },
      { status: 403 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the fields and try again.' }, { status: 400 });
  }

  // Read through the caller's client, so this is also the access check: a
  // supervisor cannot name a resident they cannot see.
  const resident = await getResident(parsed.data.sourceResidentId);
  if (!resident) return NextResponse.json({ error: 'Resident not found' }, { status: 404 });

  const draft = {
    title: parsed.data.title,
    category: parsed.data.category ?? '',
    lens: parsed.data.lens ?? null,
    importantTo: parsed.data.importantTo ?? '',
    importantFor: parsed.data.importantFor ?? '',
    statement: parsed.data.statement ?? '',
    frequency: parsed.data.frequency ?? '',
    activities: parsed.data.activities
  };

  const leaked = [
    ...new Set(
      draftTexts(draft).flatMap((text) =>
        findNames(text, {
          firstName: resident.firstName,
          lastName: resident.lastName,
          preferredName: resident.preferredName,
          pronouns: resident.pronouns
        })
      )
    )
  ];

  if (leaked.length > 0) {
    return NextResponse.json(
      {
        error:
          `This still names ${leaked.join(' and ')}. A preset is shared with everyone at ` +
          'the agency, so replace the name with {name} before saving.'
      },
      { status: 422 }
    );
  }

  const result = await createPreset(
    {
      title: draft.title,
      category: draft.category,
      lens: draft.lens,
      importantTo: draft.importantTo,
      importantFor: draft.importantFor,
      statement: draft.statement,
      frequency: draft.frequency,
      activities: draft.activities
    },
    session.profile.orgId,
    session.profile.id
  );

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // The resident is the subject of the access record: what happened is that
  // their outcome was copied out of their chart, even though the copy carries
  // no name.
  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'outcome.save_preset', 'resident', resident.id, {
    preset_id: result.id
  });

  return NextResponse.json({ id: result.id });
}
