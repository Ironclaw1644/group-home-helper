import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { personalize } from '@/lib/outcomes/library';
import type {
  LibraryActivity,
  LibraryOutcome,
  OrgOutcomePreset,
  Outcome,
  Pronouns
} from '@/lib/types';

/**
 * The one path a starter outcome takes into a resident's plan.
 *
 * Two things can be installed — a starter outcome from the jurisdiction's
 * template library, and a preset the agency wrote itself — and they must
 * behave identically once chosen: same placeholder expansion, same editable
 * rows, same framing. So both are narrowed to this shape first and then
 * installed by the same loop, rather than growing a second insert that drifts.
 *
 * They land as ordinary editable rows on purpose. A template outcome is by
 * definition not person-centered; the supervisor rewrites it in the person's
 * own words, and nothing here asserts otherwise.
 */
export type InstallableOutcome = {
  title: string;
  statement: string | null;
  importantTo: string | null;
  importantFor: string | null;
  frequency: string | null;
  lens: Outcome['lens'];
  activities: LibraryActivity[];
};

export function fromLibrary(o: LibraryOutcome): InstallableOutcome {
  return {
    title: o.title,
    statement: o.statement,
    importantTo: o.importantTo,
    importantFor: o.importantFor ?? null,
    frequency: o.frequency,
    lens: o.lens,
    activities: o.activities
  };
}

export function fromPreset(p: OrgOutcomePreset): InstallableOutcome {
  return {
    title: p.title,
    statement: p.statement,
    importantTo: p.importantTo,
    importantFor: p.importantFor,
    frequency: p.frequency,
    lens: p.lens,
    activities: p.activities
  };
}

/**
 * Install chosen starter outcomes for one resident, personalized to them.
 *
 * Returns how many outcomes landed. An outcome whose insert fails is skipped
 * rather than aborting the batch: a supervisor who picked five and got four is
 * looking at the four, and can add the fifth by hand.
 */
export async function installOutcomes(
  items: InstallableOutcome[],
  opts: { orgId: string; residentId: string; residentName: string; pronouns: Pronouns; from?: number }
): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const fill = (t: string | null) => (t === null ? null : personalize(t, opts.residentName, opts.pronouns));

  let installed = 0;

  for (const [index, template] of items.entries()) {
    const { data: outcome, error } = await supabase
      .from('resident_outcomes')
      .insert({
        org_id: opts.orgId,
        resident_id: opts.residentId,
        // Every text field goes through the placeholder expansion, not just the
        // statement. No shipped library title contains a placeholder, but an
        // agency's own preset title can — it was de-personalized out of a
        // resident's outcome — and a literal "{name}" on a plan screen is the
        // kind of thing nobody edits out because it looks like the app's.
        title: fill(template.title) ?? template.title,
        statement: fill(template.statement),
        important_to: fill(template.importantTo),
        important_for: fill(template.importantFor),
        frequency: template.frequency,
        lens: template.lens,
        sort_order: (opts.from ?? 0) + index
      })
      .select('id')
      .single();

    if (error || !outcome) continue;
    installed++;

    if (template.activities.length === 0) continue;

    await supabase.from('outcome_activities').insert(
      template.activities.map((a, i) => ({
        org_id: opts.orgId,
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

  return installed;
}
