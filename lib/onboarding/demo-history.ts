import 'server-only';

import type { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Two weeks of signed notes for a demo sandbox.
 *
 * Without history the quarterly review — the feature that replaces a weekend of
 * counting, and the clearest reason to pay for this — renders empty to the
 * exact person deciding whether to buy it.
 *
 * The pattern is deliberate rather than random, so every demo tells the same
 * story and it is a true one:
 *
 *   · the first outcome is documented most days and mostly going well
 *   · the second is patchier, with a couple of setbacks
 *   · the third, where a resident has one, is never documented at all
 *
 * That last one matters most. A demo showing a flawless record proves nothing;
 * a demo where the compliance watch says "not worked on in 21 days" and the
 * quarterly review flags the same outcome shows the product doing its job.
 */

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Weekdays of history. Enough for a quarterly report to have shape. */
const DAYS = 18;

const SIGNER_NAME = 'Sam Rivera';
const SIGNER_TITLE = 'DSP';

/** Openers, cycled so fourteen notes do not all start the same way. */
const OPENERS = [
  '{name} was up and about early in the morning.',
  '{name} woke on {possessive} own and came through for breakfast.',
  '{name} was resting comfortably at the start of shift.',
  'Staff greeted {name} at the start of shift.',
  '{name} was already awake when staff arrived.'
];

const CLOSERS = [
  'There were no problems or concerns during shift.',
  'There were no problems or concerns during shift.',
  'There were no problems or concerns during shift.'
];

function fill(text: string, name: string, possessive: string): string {
  return text.replace(/\{name\}/g, name).replace(/\{possessive\}/g, possessive);
}

/** Weekday dates going back from yesterday, most recent first. */
function recentWeekdays(count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 1);

  while (dates.length < count) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() - 1);
  }
  return dates;
}

export async function seedDemoHistory(
  admin: Admin,
  input: {
    orgId: string;
    homeId: string;
    shiftId: string;
    templateId: string;
    templateVersion: number;
    authorId: string;
    residents: Array<{
      id: string;
      first_name: string;
      preferred_name: string | null;
      pronoun_subject: string;
      pronoun_possessive: string;
    }>;
  }
): Promise<void> {
  const dates = recentWeekdays(DAYS);

  type NoteRow = {
    org_id: string;
    template_id: string;
    template_version: number;
    resident_id: string;
    home_id: string;
    shift_id: string;
    service_date: string;
    author_id: string;
    status: 'draft';
    structured_data: Record<string, unknown>;
    narrative: string;
    ai_assisted: boolean;
  };

  const notes: NoteRow[] = [];
  // Keyed by resident+date so outcome rows can find their note id after insert.
  const plan = new Map<string, { residentId: string; date: string; dayIndex: number }>();

  for (const resident of input.residents) {
    const name = resident.preferred_name?.trim() || resident.first_name;

    dates.forEach((date, dayIndex) => {
      const opener = fill(OPENERS[dayIndex % OPENERS.length], name, resident.pronoun_possessive);
      const closer = CLOSERS[dayIndex % CLOSERS.length];

      notes.push({
        org_id: input.orgId,
        template_id: input.templateId,
        template_version: input.templateVersion,
        resident_id: resident.id,
        home_id: input.homeId,
        shift_id: input.shiftId,
        service_date: date,
        author_id: input.authorId,
        status: 'draft',
        structured_data: {
          'start_of_shift.waking': [dayIndex % 3 === 0 ? 'already_awake' : 'resting_comfortably'],
          'status.mood': ['calm'],
          'status.incident': false
        },
        narrative: `${opener} Staff supported ${name} through the day as set out in ${resident.pronoun_possessive} plan. ${closer}`,
        ai_assisted: true
      });

      plan.set(`${resident.id}|${date}`, { residentId: resident.id, date, dayIndex });
    });
  }

  const { data: inserted } = await admin
    .from('notes')
    .insert(notes)
    .select('id, resident_id, service_date');

  if (!inserted?.length) return;

  // Outcomes and their activities for these residents.
  const { data: outcomes } = await admin
    .from('resident_outcomes')
    .select('id, resident_id, sort_order')
    .in(
      'resident_id',
      input.residents.map((r) => r.id)
    )
    .order('sort_order');

  const { data: activities } = await admin
    .from('outcome_activities')
    .select('id, outcome_id, sort_order')
    .in('outcome_id', (outcomes ?? []).map((o) => o.id as string));

  const outcomeRows: Array<Record<string, unknown>> = [];
  const activityRows: Array<Record<string, unknown>> = [];

  for (const note of inserted) {
    const key = `${note.resident_id}|${note.service_date}`;
    const meta = plan.get(key);
    if (!meta) continue;

    const theirs = (outcomes ?? []).filter((o) => o.resident_id === note.resident_id);

    theirs.forEach((outcome, position) => {
      // The story: first outcome healthy, second patchy, third untouched.
      let addressed: boolean;
      let progress: string | null;

      if (position === 0) {
        addressed = meta.dayIndex % 5 !== 4;
        progress = meta.dayIndex % 3 === 0 ? 'progressed' : 'maintained';
      } else if (position === 1) {
        addressed = meta.dayIndex % 3 !== 2;
        progress =
          meta.dayIndex % 7 === 1 ? 'regressed' : meta.dayIndex % 4 === 0 ? 'progressed' : 'maintained';
      } else {
        // Never worked on — this is what the compliance watch is for.
        addressed = false;
        progress = null;
      }

      outcomeRows.push({
        note_id: note.id,
        outcome_id: outcome.id,
        org_id: input.orgId,
        addressed,
        support_level: addressed
          ? ['independent', 'verbal_prompt', 'gestural_prompt'][meta.dayIndex % 3]
          : null,
        progress: addressed ? progress : null,
        comment: null
      });

      if (!addressed) return;

      for (const activity of (activities ?? []).filter((a) => a.outcome_id === outcome.id)) {
        const completed = !(position === 1 && meta.dayIndex % 7 === 1);
        activityRows.push({
          note_id: note.id,
          activity_id: activity.id,
          org_id: input.orgId,
          completed,
          concern: !completed,
          comment: completed ? null : 'Was not up for it today; staff will try again tomorrow.'
        });
      }
    });
  }

  // Documentation must land while the notes are still drafts — the
  // immutability trigger rejects both tables once a note is locked.
  if (outcomeRows.length) await admin.from('note_outcomes').insert(outcomeRows);
  if (activityRows.length) await admin.from('note_activities').insert(activityRows);

  // Sign them. The notes trigger sets `locked` and requires the signer fields,
  // which is exactly the path a real signature takes.
  await admin
    .from('notes')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_by: input.authorId,
      signature_name: SIGNER_NAME,
      signature_title: SIGNER_TITLE,
      attestation_text:
        'I attest that this note is an accurate account of the services I provided during this shift.'
    })
    .in(
      'id',
      inserted.map((n) => n.id as string)
    );
}
