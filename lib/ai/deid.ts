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
    if (!term || term.trim().length < 2) continue;
    // Whole words, any case. A substring test blocked every note for a
    // resident called Ann whose plan mentioned an announcement, and the
    // redactor below replaces whole words — so this checks what it removes.
    if (wordPattern(term.trim(), 'i').test(payload)) hits.push(term);
  }
  return hits;
}

/**
 * Colleagues, housemates, the house and the agency: names that are not the
 * resident's but identify them just as well.
 *
 * Checked case-sensitively, because these are only removed where they are
 * written as names. A staff member called Will must not turn "R. will cook"
 * into "R. staff cook", and so must not make a lowercase "will" a leak either.
 */
export function findResidualNames(
  payload: string,
  names: Array<string | null | undefined>,
  sendsDataOffMachine = true
): string[] {
  if (!deidentifyEnabled(sendsDataOffMachine)) return [];
  return names.filter(
    (n): n is string => Boolean(n && n.trim().length >= 3 && wordPattern(n.trim(), '').test(payload))
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A term as a whole word: "Ann" matches "Ann." and "Ann's", never "Annual". */
function wordPattern(term: string, flags: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, `gu${flags}`);
}

export type RedactionInput = {
  /** The person the note is about: every form of their name becomes "R.". */
  resident: {
    firstName: string;
    lastName?: string | null;
    preferredName?: string | null;
    medicaidId?: string | null;
  };
  /** Staff at the agency. Written as "staff". */
  staff?: Array<string | null | undefined>;
  /** Other residents. Written as "a peer". */
  peers?: Array<string | null | undefined>;
  /** House names and addresses, the agency's name. Written as "the home". */
  places?: Array<string | null | undefined>;
};

export type Redactor = {
  /** Apply to every string that will be sent. Identity when de-id is off. */
  redact: (text: string) => string;
  /** Resident identifiers, for findResidualIdentifiers. */
  residentTerms: string[];
  /** Everyone and everywhere else, for findResidualNames. */
  otherNames: string[];
};

/** "Maria del Carmen Ruiz" → the full string and each part long enough to be a name. */
function nameForms(full: string | null | undefined, min = 3): string[] {
  const t = (full ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return [];
  const parts = t.split(' ').filter((p) => p.length >= min);
  return [t, ...parts];
}

/**
 * Remove the names the record knows about from outbound text.
 *
 * scrubFreeText catches identifiers by shape — digit runs, dates, phone
 * numbers. It cannot catch a name, and names reach the prompt in places nobody
 * types into the note: an ISP outcome titled "Jordan will prepare lunch", a
 * daily question, a DSP's comment "walked to the store with Maria", a shift
 * the agency labelled with a house name. Those are replaced here with the same
 * placeholders the note already uses, longest name first so "Jordan Blake" is
 * not half-replaced as "R. Blake".
 */
export function buildRedactor(input: RedactionInput, sendsDataOffMachine = true): Redactor {
  // Two letters for the resident's own names: "Jo" is a preferred name, and
  // the cost of also replacing a stray "jo" is nothing.
  const residentTerms = [
    ...nameForms([input.resident.firstName, input.resident.lastName].filter(Boolean).join(' '), 2),
    ...nameForms(input.resident.preferredName, 2),
    ...(input.resident.medicaidId ? [input.resident.medicaidId] : [])
  ];

  if (!deidentifyEnabled(sendsDataOffMachine)) {
    return { redact: (t) => t, residentTerms: [], otherNames: [] };
  }

  const own = new Set(residentTerms.map((t) => t.toLowerCase()));
  type Rule = { term: string; to: string; flags: string };
  const rules: Rule[] = [];

  if (input.resident.medicaidId?.trim()) {
    rules.push({ term: input.resident.medicaidId.trim(), to: '[id]', flags: 'i' });
  }
  for (const t of residentTerms) {
    if (t !== input.resident.medicaidId) rules.push({ term: t, to: PLACEHOLDER, flags: 'i' });
  }
  const others = (list: Array<string | null | undefined> | undefined, to: string, whole = false) => {
    for (const n of list ?? []) {
      // Places only as written in full: splitting "12 Oak Road" into words
      // would strip every "Road" out of every note.
      const forms = whole ? nameForms(n).slice(0, 1) : nameForms(n);
      for (const form of forms) {
        // A colleague who shares the resident's first name is the resident,
        // as far as the text can tell. The resident rule has already run.
        if (own.has(form.toLowerCase())) continue;
        rules.push({ term: form, to, flags: '' });
      }
    }
  };
  others(input.staff, 'staff');
  others(input.peers, 'a peer');
  others(input.places, 'the home', true);

  // Longest first, so a full name goes before its parts.
  rules.sort((a, b) => b.term.length - a.term.length);

  const otherNames = Array.from(new Set(rules.filter((r) => r.flags === '').map((r) => r.term)));

  return {
    residentTerms,
    otherNames,
    redact: (text: string) =>
      rules.reduce((acc, r) => acc.replace(wordPattern(r.term, r.flags), r.to), text)
  };
}
