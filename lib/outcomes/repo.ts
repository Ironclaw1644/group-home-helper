import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { answeredOutcomes } from '@/lib/outcomes/answered';
import type {
  MeasureType,
  NoteActivity,
  NoteOutcome,
  Outcome,
  OutcomeActivity,
  ProgressLevel,
  SupportLevel
} from '@/lib/types';

/**
 * ISP outcomes and the documentation recorded against them.
 *
 * Reads go through the caller's client so RLS scopes them: a DSP sees the
 * outcomes for residents in their homes and nothing else. Writing an outcome is
 * a supervisor act, because it is a clinical document written by the planning
 * team — a DSP documenting a shift must not be able to reword what they are
 * being measured against.
 */

const OUTCOME_COLUMNS =
  'id, resident_id, title, statement, support_strategies, measure, frequency, ' +
  'category, sort_order, active, started_on, ended_on, important_to, important_for, ' +
  'target_date, lens';

function toOutcome(r: Record<string, unknown>): Outcome {
  return {
    id: r.id as string,
    residentId: r.resident_id as string,
    title: r.title as string,
    statement: (r.statement as string | null) ?? null,
    supportStrategies: (r.support_strategies as string | null) ?? null,
    measure: (r.measure as string | null) ?? null,
    frequency: (r.frequency as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    active: Boolean(r.active),
    startedOn: (r.started_on as string | null) ?? null,
    endedOn: (r.ended_on as string | null) ?? null,
    importantTo: (r.important_to as string | null) ?? null,
    importantFor: (r.important_for as string | null) ?? null,
    targetDate: (r.target_date as string | null) ?? null,
    lens: (r.lens as Outcome['lens']) ?? null
  };
}

const ACTIVITY_COLUMNS =
  'id, outcome_id, description, measure_type, measure, support_instructions, ' +
  'daily_question, sort_order, active';

function toActivity(r: Record<string, unknown>): OutcomeActivity {
  return {
    id: r.id as string,
    outcomeId: r.outcome_id as string,
    description: r.description as string,
    measureType: (r.measure_type as MeasureType) ?? 'routine',
    measure: (r.measure as string | null) ?? null,
    supportInstructions: (r.support_instructions as string | null) ?? null,
    dailyQuestion: (r.daily_question as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    active: Boolean(r.active)
  };
}

/**
 * Support activities for a resident's outcomes.
 *
 * Fetched in one query across all their outcomes rather than per outcome: a
 * note page needs every one of them, and a request per outcome would be six
 * round trips before a DSP can start documenting.
 */
export async function listActivities(
  outcomeIds: string[],
  includeInactive = false
): Promise<OutcomeActivity[]> {
  if (outcomeIds.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  let q = supabase.from('outcome_activities').select(ACTIVITY_COLUMNS).in('outcome_id', outcomeIds);
  // A note signed while an activity was live must still print the question it
  // was answering, even after that activity is retired.
  if (!includeInactive) q = q.eq('active', true);

  const { data, error } = await q.order('sort_order');

  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toActivity);
}

export async function getNoteActivities(noteId: string): Promise<NoteActivity[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('note_activities')
    .select('activity_id, completed, concern, comment')
    .eq('note_id', noteId);

  if (error) throw error;
  return (data ?? []).map((r) => ({
    activityId: r.activity_id as string,
    completed: (r.completed as boolean | null) ?? null,
    concern: Boolean(r.concern),
    comment: (r.comment as string | null) ?? null
  }));
}

/**
 * Save the per-activity yes/no record.
 *
 * Unanswered activities are skipped rather than written as `false`. A blank is
 * a gap in the record and a no is a documented fact; storing one as the other
 * would put a claim in the chart that nobody made.
 */
export async function saveNoteActivities(
  noteId: string,
  orgId: string,
  entries: NoteActivity[]
): Promise<{ ok: true } | { error: string }> {
  const answered = entries.filter((e) => e.completed !== null || e.concern || e.comment?.trim());
  if (answered.length === 0) return { ok: true };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('note_activities').upsert(
    answered.map((e) => ({
      note_id: noteId,
      activity_id: e.activityId,
      org_id: orgId,
      completed: e.completed,
      concern: e.concern,
      comment: e.comment?.trim() || null,
      updated_at: new Date().toISOString()
    })),
    { onConflict: 'note_id,activity_id' }
  );

  if (error) {
    if (error.code === '2F003' || /signed/i.test(error.message)) {
      return { error: 'This note is signed and cannot be changed. Add an addendum instead.' };
    }
    if (error.code === '42501') return { error: 'You do not have access to this note.' };
    return { error: error.message };
  }
  return { ok: true };
}

/** A resident's outcomes, in the order they appear on the note form. */
export async function listOutcomes(
  residentId: string,
  includeInactive = false
): Promise<Outcome[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from('resident_outcomes').select(OUTCOME_COLUMNS).eq('resident_id', residentId);
  if (!includeInactive) q = q.eq('active', true);

  const { data, error } = await q.order('sort_order').order('title');
  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toOutcome);
}

export type OutcomeInput = {
  residentId: string;
  title: string;
  statement?: string | null;
  supportStrategies?: string | null;
  measure?: string | null;
  frequency?: string | null;
  category?: string | null;
  sortOrder?: number;
  startedOn?: string | null;
  endedOn?: string | null;
  active?: boolean;
};

export async function createOutcome(
  input: OutcomeInput,
  orgId: string
): Promise<{ id: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('resident_outcomes')
    .insert({
      org_id: orgId,
      resident_id: input.residentId,
      title: input.title.trim(),
      statement: input.statement?.trim() || null,
      support_strategies: input.supportStrategies?.trim() || null,
      measure: input.measure?.trim() || null,
      frequency: input.frequency?.trim() || null,
      category: input.category?.trim() || null,
      sort_order: input.sortOrder ?? 0,
      started_on: input.startedOn || null,
      ended_on: input.endedOn || null,
      active: input.active ?? true
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '42501') {
      return { error: 'Only a supervisor or administrator can edit a service plan.' };
    }
    return { error: error.message };
  }
  return { id: data.id };
}

export async function updateOutcome(
  id: string,
  input: Partial<OutcomeInput>
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.statement !== undefined) patch.statement = input.statement?.trim() || null;
  if (input.supportStrategies !== undefined)
    patch.support_strategies = input.supportStrategies?.trim() || null;
  if (input.measure !== undefined) patch.measure = input.measure?.trim() || null;
  if (input.frequency !== undefined) patch.frequency = input.frequency?.trim() || null;
  if (input.category !== undefined) patch.category = input.category?.trim() || null;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.startedOn !== undefined) patch.started_on = input.startedOn || null;
  if (input.endedOn !== undefined) patch.ended_on = input.endedOn || null;
  if (input.active !== undefined) patch.active = input.active;

  const { error } = await supabase.from('resident_outcomes').update(patch).eq('id', id);
  if (error) {
    if (error.code === '42501') {
      return { error: 'Only a supervisor or administrator can edit a service plan.' };
    }
    return { error: error.message };
  }
  return { ok: true };
}

/**
 * Retire an outcome rather than deleting it.
 *
 * Signed notes reference it, and those are permanent records. A deleted outcome
 * would leave documentation pointing at nothing — which is exactly the kind of
 * dangling reference an auditor treats as a missing plan.
 */
export async function retireOutcome(
  id: string,
  endedOn: string
): Promise<{ ok: true } | { error: string }> {
  return updateOutcome(id, { active: false, endedOn });
}

// ---------------------------------------------------------------------------
// Per-note documentation
// ---------------------------------------------------------------------------

export async function getNoteOutcomes(noteId: string): Promise<NoteOutcome[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('note_outcomes')
    .select('outcome_id, addressed, support_level, progress, comment')
    .eq('note_id', noteId);

  if (error) throw error;
  // A row that exists is a row somebody answered — the unanswered outcomes are
  // the ones with no row here at all, so they are simply absent from this list.
  return (data ?? []).map((r) => ({
    outcomeId: r.outcome_id as string,
    addressed: Boolean(r.addressed),
    supportLevel: (r.support_level as SupportLevel | null) ?? null,
    progress: (r.progress as ProgressLevel | null) ?? null,
    comment: (r.comment as string | null) ?? null
  }));
}

/**
 * Save what was recorded against each outcome.
 *
 * Upserted in one call so a partially-saved shift cannot leave some outcomes
 * documented and others silently dropped. The database trigger rejects the
 * whole thing if the note is already signed.
 *
 * Entries with `addressed: null` are dropped rather than written. The column is
 * `not null default false`, so persisting an unanswered outcome would turn "no
 * one has looked at this yet" into the recorded clinical claim "this was not
 * worked on" — the exact silent negative this filter exists to prevent. The
 * client also filters, and both are deliberate: this is the one that is load
 * bearing, because it is the last code between an unanswered chip and a
 * Medicaid record.
 */
export async function saveNoteOutcomes(
  noteId: string,
  orgId: string,
  entries: NoteOutcome[]
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const answered = answeredOutcomes(entries);
  if (answered.length === 0) return { ok: true };

  const { error } = await supabase.from('note_outcomes').upsert(
    answered.map((e) => ({
      note_id: noteId,
      outcome_id: e.outcomeId,
      org_id: orgId,
      addressed: e.addressed,
      support_level: e.supportLevel,
      progress: e.progress,
      comment: e.comment?.trim() || null,
      updated_at: new Date().toISOString()
    })),
    { onConflict: 'note_id,outcome_id' }
  );

  if (error) {
    // The immutability trigger raises restrict_violation.
    if (error.code === '2F003' || /signed/i.test(error.message)) {
      return { error: 'This note is signed and cannot be changed. Add an addendum instead.' };
    }
    if (error.code === '42501') {
      return { error: 'You do not have access to this note.' };
    }
    return { error: error.message };
  }
  return { ok: true };
}

export type OutcomeProgressRow = {
  outcomeId: string;
  title: string;
  statement: string | null;
  frequency: string | null;
  /** Signed notes in the period that touched this resident at all. */
  timesAddressed: number;
  timesNotAddressed: number;
  progressed: number;
  maintained: number;
  regressed: number;
  declined: number;
  lastAddressed: string | null;
};

/** Progress across a date range — the plan-review and audit view. */
export async function outcomeProgress(
  residentId: string,
  from: string,
  to: string
): Promise<OutcomeProgressRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('outcome_progress_summary', {
    p_resident_id: residentId,
    p_from: from,
    p_to: to
  });

  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    outcomeId: r.outcome_id as string,
    title: r.title as string,
    statement: (r.statement as string | null) ?? null,
    frequency: (r.frequency as string | null) ?? null,
    timesAddressed: Number(r.times_addressed ?? 0),
    timesNotAddressed: Number(r.times_not_addressed ?? 0),
    progressed: Number(r.progressed ?? 0),
    maintained: Number(r.maintained ?? 0),
    regressed: Number(r.regressed ?? 0),
    declined: Number(r.declined ?? 0),
    lastAddressed: (r.last_addressed as string | null) ?? null
  }));
}
