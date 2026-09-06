/**
 * Deterministic post-processing of generated narrative.
 *
 * Some parts of a progress note are not the model's judgement to make. The
 * closing sentence in particular is a factual claim about the shift that is
 * fully determined by what the DSP recorded — so we set it ourselves rather
 * than instructing the model and hoping.
 *
 * This is not belt-and-braces. In measured runs a local 9B model produced the
 * required closer only about a third of the time, and a hosted model will
 * occasionally drop it too. Making it code turns an unreliable instruction
 * into a guarantee, and removes one more thing the model can get wrong.
 */

export const NO_CONCERN_CLOSER = 'There were no problems or concerns during shift.';

/**
 * Matches the house closing sentence and the near-misses models produce
 * ("There were no problems or concerns during the shift", "...during shift").
 */
const CLOSER_PATTERN =
  /\s*there\s+(?:were|was)\s+no\s+(?:problems?|issues?|concerns?)(?:\s+or\s+concerns?)?\s+(?:noted\s+)?(?:during|throughout|for)?\s*(?:the\s+)?shift\.?\s*$/i;

/** Strip any model-authored closer from the end of the narrative. */
export function stripClosingSentence(narrative: string): string {
  return narrative.replace(CLOSER_PATTERN, '').trim();
}

/** A sentence already ended by a stop, allowing a closing quote or bracket. */
const TERMINATED = /[.!?]["'’”)\]]?$/;

/**
 * Finish the body on a full stop before anything is appended to it.
 *
 * Second line of defence for a bug that reached a printed Medicaid form. The
 * "R." placeholder used to swallow the sentence-ending period on rehydration,
 * and this file then joined the result to the closing sentence with a bare
 * space — "...to support JP There were no problems or concerns during shift."
 * That is fixed at source in deid.ts, but a model that simply forgot its last
 * period would produce the identical run-on, so the join refuses to run two
 * sentences together whatever the cause.
 */
function ensureTerminalPunctuation(body: string): string {
  if (body === '') return body;
  return TERMINATED.test(body) ? body : `${body}.`;
}

/**
 * Apply the closing sentence the data calls for.
 *
 * - No concern recorded → the note ends with the standard sentence, exactly.
 * - A concern recorded → any reassuring closer the model added is removed, and
 *   nothing replaces it. Saying a shift was uneventful when an incident was
 *   logged is the more dangerous error of the two.
 */
export function applyClosingSentence(narrative: string, hasConcern: boolean): string {
  const body = ensureTerminalPunctuation(stripClosingSentence(narrative));
  if (hasConcern) return body;
  if (body === '') return NO_CONCERN_CLOSER;
  return `${body} ${NO_CONCERN_CLOSER}`;
}

/**
 * Collapse whitespace and force a single paragraph.
 *
 * The form has one ruled narrative block; a model that returns bullets or line
 * breaks would render badly in the PDF.
 */
export function normalizeNarrative(narrative: string): string {
  return narrative
    .replace(/\r/g, '')
    .replace(/^\s*[-*•]\s*/gm, '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function finalizeNarrative(narrative: string, hasConcern: boolean): string {
  return applyClosingSentence(normalizeNarrative(narrative), hasConcern);
}
