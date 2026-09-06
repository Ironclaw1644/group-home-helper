/**
 * What a resident's week usually looks like, and what may be carried into a
 * prepared note.
 *
 * A DSP spends about ten minutes on a note, and most of it is not writing. It
 * is arriving at an empty form and re-entering the same morning routine that
 * happened yesterday, and the day before, and every weekday for a month. So a
 * supervisor prepares the coming week in one action and each draft opens with
 * that person's routine already in it, to be corrected rather than composed.
 *
 * Everything in this file is pure, and deliberately so: what a prepared note
 * asserts is the part worth being able to test exhaustively, offline, without a
 * database.
 *
 * ---------------------------------------------------------------------------
 * What is never carried forward
 * ---------------------------------------------------------------------------
 *
 * A suggestion has to be plausible enough to save time and cannot be a claim
 * that would embarrass anyone if signed unread. Four rules, and they are all
 * refusals:
 *
 *  1. **Nothing about the ISP outcomes.** "Worked on this" and "not this shift"
 *     are clinical statements about a person's service plan. A machine guessing
 *     them from last week is the same defect as an editor that pre-selected
 *     "Not this shift", moved somewhere harder to notice. Outcomes are not
 *     touched here at all — a prepared note has no `note_outcomes` rows, so
 *     every outcome opens unanswered exactly as a hand-started note does.
 *
 *  2. **Nothing that flags a concern.** An incident, an injury, a refusal, a
 *     bad mood: these are the entries a reviewer reads first, and predicting
 *     one is either alarming or, worse, normalising. They are always left
 *     blank for the DSP to raise.
 *
 *  3. **No free text.** Last week's "what happened" describes last week. The
 *     narrative of a prepared note is empty, and text fields stay empty.
 *
 *  4. **Nothing that is not actually a routine.** A selection has to appear in
 *     a clear majority of recent notes for the same person on the same shift
 *     before it is suggested, so "we did that once" never becomes "we do that".
 */

import type { FormTemplateSchema, StructuredData } from '@/lib/types';

/**
 * How much of the recent history has to agree before something counts as
 * routine. Two thirds: high enough that an occasional outing is not predicted,
 * low enough that a five-day-a-week routine survives a couple of exceptions.
 */
export const ROUTINE_THRESHOLD = 2 / 3;

/** Minimum signed notes before any pattern is trusted at all. */
export const MIN_HISTORY = 3;

/** How far back to look for the pattern. Four weeks of the same weekday shift. */
export const HISTORY_DAYS = 28;

/** Days prepared in one action. */
export const WEEK_LENGTH = 7;

export type PriorNote = {
  serviceDate: string;
  structuredData: StructuredData;
};

/**
 * Field keys that must never be suggested, whatever the history says.
 *
 * Anything that marks the shift as one with a concern. `shiftHasConcern` reads
 * exactly these, so leaving them out is what guarantees a prepared note never
 * opens already reporting an incident — and never opens quietly asserting there
 * was not one either.
 */
export function concernKeys(schema: FormTemplateSchema): Set<string> {
  const keys = new Set<string>();
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const key = `${section.key}.${field.key}`;
      if (field.type === 'boolean' && field.flags_concern_when_true) keys.add(key);
      if (field.type === 'chips' && field.options.some((o) => o.flags_concern)) keys.add(key);
    }
  }
  return keys;
}

/**
 * The selections that recur often enough to be this person's routine.
 *
 * Only chip fields. Booleans are excluded because on this form a boolean is
 * either a concern flag or close to one, and a suggested `true` reads as an
 * assertion rather than a starting point. Text fields are excluded by rule 3.
 */
export function routineSelections(
  schema: FormTemplateSchema,
  history: readonly PriorNote[]
): StructuredData {
  if (history.length < MIN_HISTORY) return {};

  const forbidden = concernKeys(schema);
  const suggested: StructuredData = {};

  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.type !== 'chips') continue;

      const key = `${section.key}.${field.key}`;
      if (forbidden.has(key)) continue;

      // Only options that flag no concern are eligible, even in a field that is
      // not itself a concern field.
      const safe = new Set(field.options.filter((o) => !o.flags_concern).map((o) => o.value));

      const counts = new Map<string, number>();
      for (const note of history) {
        const value = note.structuredData[key];
        if (!Array.isArray(value)) continue;
        // One note counts once for a value however many times it appears.
        for (const v of new Set(value)) {
          if (safe.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      }

      const routine = [...counts.entries()]
        .filter(([, n]) => n / history.length >= ROUTINE_THRESHOLD)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([value]) => value);

      if (routine.length === 0) continue;

      // A single-select field takes the strongest one only; suggesting two
      // would produce a value the form cannot represent.
      suggested[key] = field.multiple ? routine : [routine[0]];
    }
  }

  return suggested;
}

/**
 * The history that should inform one prepared note.
 *
 * Same person, same shift, recent, and signed — an unsigned draft is somebody's
 * unfinished work and is not evidence of anything. Callers do the filtering by
 * resident and shift; this handles the window.
 */
export function recentHistory(history: readonly PriorNote[], before: string): PriorNote[] {
  const cutoff = addDays(before, -HISTORY_DAYS);
  return history
    .filter((n) => n.serviceDate < before && n.serviceDate >= cutoff)
    .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));
}

/** The seven service dates a pre-stage covers, starting at `from`. */
export function weekDates(from: string): string[] {
  return Array.from({ length: WEEK_LENGTH }, (_, i) => addDays(from, i));
}

/**
 * Date arithmetic on a plain YYYY-MM-DD service date.
 *
 * Deliberately not `new Date(str)` plus local-time maths: a service date is a
 * calendar day on a Medicaid record, not an instant, and going through a
 * timezone is how it lands on the wrong day. UTC noon keeps it away from every
 * boundary.
 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d, 12));
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** True when `serviceDate` is still ahead of the agency's own today. */
export function isFutureServiceDate(serviceDate: string, todayInOrgTz: string): boolean {
  return serviceDate > todayInOrgTz;
}
