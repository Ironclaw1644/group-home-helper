import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getActiveTemplate, getShifts } from '@/lib/notes/repo';
import {
  recentHistory,
  routineSelections,
  weekDates,
  type PriorNote
} from '@/lib/notes/prestage';
import type { StructuredData } from '@/lib/types';

/**
 * Prepare a week of unsigned drafts.
 *
 * One action, and every resident in the house has a draft waiting for every
 * shift on every day of the coming week, already carrying their routine. The
 * DSP opens the day's note, corrects what is different, answers the service
 * plan, adds a line, and signs.
 *
 * The whole thing runs through the caller's own session rather than the service
 * key, so RLS decides which residents and which house are in scope. A
 * supervisor cannot prepare a week for a home they are not on, and the check
 * that makes that true is the database's, not this function's.
 *
 * Idempotent: it never touches a note that already exists. Re-running after
 * someone has started Wednesday leaves Wednesday alone, which matters because
 * the obvious way to use this is to run it every Monday without checking.
 */

export type PrestageResult = {
  from: string;
  to: string;
  /** Drafts created by this run. */
  created: number;
  /** Notes that already existed and were left untouched. */
  existing: number;
  /** Of the created drafts, how many carried a routine forward. */
  withRoutine: number;
};

export async function prestageWeek(params: {
  orgId: string;
  homeId: string;
  from: string;
  actorId: string;
}): Promise<PrestageResult | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const dates = weekDates(params.from);
  const to = dates[dates.length - 1];

  const [template, shifts] = await Promise.all([getActiveTemplate(), getShifts(params.homeId)]);

  if (shifts.length === 0) {
    return { error: 'This house has no shifts set up yet, so there is nothing to prepare.' };
  }

  // Residents come through the session: RLS has already limited this to homes
  // the caller is actually on.
  const { data: residents, error: residentError } = await supabase
    .from('residents')
    .select('id, is_demo')
    .eq('home_id', params.homeId)
    .eq('active', true);

  if (residentError) return { error: 'Could not read the roster.' };
  if (!residents?.length) {
    return { error: 'No active residents in this house yet.' };
  }

  // One read for the whole run rather than one per note. The pattern comes from
  // signed notes only — an unsigned draft is somebody's unfinished work and is
  // not evidence that anything happened.
  const { data: history } = await supabase
    .from('notes')
    .select('resident_id, shift_id, service_date, structured_data')
    .in(
      'resident_id',
      residents.map((r) => r.id)
    )
    .eq('status', 'signed')
    .lt('service_date', params.from)
    .order('service_date', { ascending: false })
    .limit(2000);

  // Existing notes across the target week, so nothing is overwritten and the
  // count of what was skipped is honest.
  const { data: existingNotes } = await supabase
    .from('notes')
    .select('resident_id, shift_id, service_date')
    .eq('home_id', params.homeId)
    .gte('service_date', params.from)
    .lte('service_date', to);

  const taken = new Set(
    (existingNotes ?? []).map((n) => `${n.resident_id}|${n.shift_id}|${n.service_date}`)
  );

  // Routine is per resident *and* per shift: a 7AM-7PM day and a 7PM-7AM night
  // are different shapes of day and must not borrow each other's pattern.
  const routineFor = new Map<string, StructuredData>();
  for (const resident of residents) {
    for (const shift of shifts) {
      const prior: PriorNote[] = (history ?? [])
        .filter((n) => n.resident_id === resident.id && n.shift_id === shift.id)
        .map((n) => ({
          serviceDate: n.service_date as string,
          structuredData: (n.structured_data ?? {}) as StructuredData
        }));

      routineFor.set(
        `${resident.id}|${shift.id}`,
        routineSelections(template.schema, recentHistory(prior, params.from))
      );
    }
  }

  const rows: Array<Record<string, unknown>> = [];
  let withRoutine = 0;

  for (const date of dates) {
    for (const resident of residents) {
      for (const shift of shifts) {
        if (taken.has(`${resident.id}|${shift.id}|${date}`)) continue;

        const routine = routineFor.get(`${resident.id}|${shift.id}`) ?? {};
        if (Object.keys(routine).length > 0) withRoutine++;

        rows.push({
          org_id: params.orgId,
          template_id: template.id,
          template_version: template.version,
          resident_id: resident.id,
          home_id: params.homeId,
          shift_id: shift.id,
          service_date: date,
          // The supervisor who prepared it. The DSP who signs becomes the
          // signer; authorship is reassigned when someone else picks it up.
          author_id: params.actorId,
          status: 'draft',
          structured_data: routine,
          // Never a prepared narrative. Last week's words describe last week,
          // and a paragraph nobody wrote is the one thing that would make this
          // feature indefensible.
          narrative: '',
          is_training_example: resident.is_demo,
          prestaged_at: new Date().toISOString(),
          prestaged_by: params.actorId
          // prestage_confirmed_at stays null: signing is blocked until a DSP
          // says the prepared entries match the shift they worked.
          //
          // No note_outcomes rows are written here, deliberately and for the
          // same reason. Every ISP outcome opens unanswered.
        });
      }
    }
  }

  const existing = dates.length * residents.length * shifts.length - rows.length;

  if (rows.length === 0) {
    return { from: params.from, to, created: 0, existing, withRoutine: 0 };
  }

  // Ignore duplicates rather than failing the batch: someone opening a note by
  // hand while this runs should not lose the rest of the week.
  const { data: inserted, error } = await supabase
    .from('notes')
    .upsert(rows, { onConflict: 'resident_id,shift_id,service_date', ignoreDuplicates: true })
    .select('id');

  if (error) {
    console.error('[prestage] insert failed', error.message);
    return { error: 'Could not prepare the week. Nothing was created.' };
  }

  return {
    from: params.from,
    to,
    created: inserted?.length ?? 0,
    existing,
    withRoutine
  };
}
