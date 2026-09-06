/**
 * The three states an ISP outcome can be in on one shift.
 *
 * This exists because "unanswered" and "not worked on" used to be the same
 * value. `NoteOutcome.addressed` was a plain boolean initialised to `false`, so
 * a note nobody had touched yet already asserted that none of this person's
 * service-plan outcomes had been worked on — a clinical claim, pre-filled into
 * a Medicaid record, attributed to a DSP who had not looked at it.
 *
 * Every place that decides what an outcome means — what to save, what to
 * print, what to send the model, whether the note can be signed — goes through
 * this file, so the three states cannot drift apart again.
 */

import type { NoteOutcome, Outcome } from '@/lib/types';

export type OutcomeStatus =
  /** The DSP said this was worked on. */
  | 'addressed'
  /** The DSP said this was not worked on. A recorded fact, and a real signal. */
  | 'not_addressed'
  /** Nobody has answered. A gap in the record, and not a negative. */
  | 'unanswered';

/**
 * Classify one outcome's entry.
 *
 * A missing entry and an entry with `addressed: null` are the same thing: the
 * unanswered state has no row in `note_outcomes`, so callers reading from the
 * database see absence and callers reading editor state see null.
 */
export function outcomeStatus(entry: NoteOutcome | undefined | null): OutcomeStatus {
  if (!entry || entry.addressed === null) return 'unanswered';
  return entry.addressed ? 'addressed' : 'not_addressed';
}

/**
 * The entries that are safe to write to the database.
 *
 * `note_outcomes.addressed` is `not null default false`, so an unanswered entry
 * cannot be stored as itself — it would be stored as the negative. Dropping it
 * is what keeps absence meaning absence.
 */
export function answeredOutcomes(
  entries: readonly NoteOutcome[]
): Array<NoteOutcome & { addressed: boolean }> {
  return entries.filter((e): e is NoteOutcome & { addressed: boolean } => e.addressed !== null);
}

/**
 * The outcomes on this person's plan that still need a human answer.
 *
 * Used to block signing. A signed note is permanent, so it must not contain an
 * outcome nobody ruled on.
 */
export function unansweredOutcomes<T extends Pick<Outcome, 'id'>>(
  outcomes: readonly T[],
  entries: readonly NoteOutcome[]
): T[] {
  return outcomes.filter(
    (o) => outcomeStatus(entries.find((e) => e.outcomeId === o.id)) === 'unanswered'
  );
}
