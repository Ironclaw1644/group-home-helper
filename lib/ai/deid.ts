/**
 * De-identification for model calls.
 *
 * Only relevant when note content leaves the machine.
 *
 * - **Local provider (default).** The model runs on the operator's own
 *   hardware, so nothing ever leaves. De-identification is skipped: it would
 *   protect against nothing and only degrade the note.
 * - **Hosted provider.** Content goes to a third party, so it is stripped by
 *   default. Set AI_DEIDENTIFY=false to send full PHI once BAAs are signed
 *   with the model vendor and your host.
 */

const PLACEHOLDER = 'R.';

/**
 * @param sendsDataOffMachine whether the active provider transmits note
 * content to a third party. Defaults to true so a caller that forgets to pass
 * it gets the protective behaviour.
 */
export function deidentifyEnabled(sendsDataOffMachine = true): boolean {
  // Nothing to protect against when the model is on this machine.
  if (!sendsDataOffMachine) return false;
  // Otherwise default to the safe mode: only an explicit "false" disables it.
  return process.env.AI_DEIDENTIFY !== 'false';
}

export type Rehydrator = (text: string) => string;

/**
 * Returns the name to send to the model and a function that restores the real
 * one afterwards. When de-identification is off, both are pass-throughs.
 */
export function prepareName(
  realFirstName: string,
  sendsDataOffMachine = true
): {
  outboundName: string;
  rehydrate: Rehydrator;
} {
  if (!deidentifyEnabled(sendsDataOffMachine)) {
    return { outboundName: realFirstName, rehydrate: (t) => t };
  }

  return {
    outboundName: PLACEHOLDER,
    rehydrate: (text: string) => rehydratePlaceholder(text, realFirstName)
  };
}

/** Where the placeholder may legitimately appear: end, whitespace, or punctuation. */
const PLACEHOLDER_TOKEN = /\bR\.(?=$|\s|[,;:)'’"”])/g;

/**
 * Put the real name back without eating a sentence.
 *
 * The placeholder's period does double duty. In "R. ate breakfast" it belongs
 * to the abbreviation and has to disappear along with it. In "Staff provided
 * verbal prompts to support R." it is *also* the full stop ending the sentence,
 * and dropping it produced this, live, in a signed and printed note:
 *
 *   "...to support JP There were no problems or concerns during shift."
 *
 * Which of the two it is can be read off what follows. End of text, or a new
 * sentence beginning with a capital, means the period was carrying the stop and
 * must be kept. A lowercase word after it means the sentence continues and the
 * period belonged to the abbreviation alone.
 */
function rehydratePlaceholder(text: string, realFirstName: string): string {
  return text.replace(PLACEHOLDER_TOKEN, (_match, offset: number, whole: string) => {
    const rest = whole.slice(offset + PLACEHOLDER.length);

    // Nothing follows: the period was ending the note.
    if (rest.trim() === '') return `${realFirstName}.`;

    const next = /^\s+(\S)/.exec(rest);
    // A capital — or an opening quote or bracket — after the space starts a new
    // sentence, so the period was the previous sentence's full stop.
    if (next && /[A-Z"“(]/.test(next[1])) return `${realFirstName}.`;

    return realFirstName;
  });
}

/**
 * Last line of defence before an outbound request.
 *
 * Structured selections are drawn from a fixed vocabulary, but free-text fields
 * (an incident description, an "other" activity) are typed by staff and can
 * contain anything. This strips the patterns that would be identifiers.
 */
export function scrubFreeText(text: string, sendsDataOffMachine = true): string {
  if (!deidentifyEnabled(sendsDataOffMachine)) return text;

  return (
    text
      // Medicaid IDs and other long digit runs
      .replace(/\b\d{9,}\b/g, '[id]')
      // SSN-shaped
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[id]')
      // Dates
      .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '[date]')
      // Phone numbers
      .replace(/\b\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone]')
      // Email addresses
      .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[email]')
      .trim()
  );
}

/**
 * Assert that nothing obviously identifying is about to leave. Used by the
 * verification script and by the route in development, so a regression in the
 * scrubbing above fails loudly rather than silently leaking.
 */
export function findResidualIdentifiers(
  payload: string,
  forbidden: Array<string | null | undefined>,
  sendsDataOffMachine = true
): string[] {
  if (!deidentifyEnabled(sendsDataOffMachine)) return [];
  const hits: string[] = [];
  for (const term of forbidden) {
    if (!term || term.length < 3) continue;
    if (payload.toLowerCase().includes(term.toLowerCase())) hits.push(term);
  }
  return hits;
}
