import type { Outcome, OutcomeActivity, Pronouns } from '@/lib/types';

/**
 * Take a person back out of an outcome, so it can be saved as an agency preset.
 *
 * A resident's outcome is written about that resident: their name, their
 * pronouns, sometimes their room or their nickname. A preset is an org-wide
 * row that everyone at the agency can read, including staff with no access to
 * the home that person lives in. Saving the outcome raw would move PHI across
 * that boundary quietly, which is the failure this module exists to prevent.
 *
 * So the name and pronoun forms are replaced with the same placeholders
 * `personalize()` in lib/outcomes/library.ts already expands on install —
 * `{name}`, `{subject}`, `{object}`, `{possessive}` — and the result is put in
 * front of the supervisor to read before anything is written.
 *
 * What this can and cannot do, stated plainly because the UI has to say it:
 *
 *  - It knows the names on the resident's record. A nickname staff use that is
 *    not on the record ("Mickey" for Michael), a housemate's name, a relative's
 *    name, a street name — none of those can be detected here. The supervisor
 *    reads the text; that is the real control, and this is the assist.
 *  - Some pronoun forms are genuinely ambiguous. For a resident whose pronouns
 *    are she/her/her, the word "her" is both the object and the possessive
 *    form, and choosing one would put the wrong word in another person's plan
 *    later — `{object}` expands to "them" for a they/them resident where
 *    `{possessive}` expands to "their". Those are left alone and reported
 *    rather than guessed at.
 *  - Reflexive forms ("herself", "themselves") have no placeholder at all.
 *    Reported, not rewritten.
 *
 * A leftover NAME is a blocker: the save is refused, in the browser and again
 * on the server. A leftover pronoun is a warning: it is not identifying, and
 * the supervisor can reword it.
 */

/** The parts of a resident this module needs. Not the whole record. */
export type NameIdentity = {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  pronouns: Pronouns;
};

export type DepersonalizedText = {
  text: string;
  /** Names still in the text after substitution. Blocks the save. */
  residualNames: string[];
  /** Words deliberately left alone because substituting would be a guess. */
  ambiguous: string[];
  /** True when a replaced pronoun was capitalised, so casing may need a look. */
  recasedPronoun: boolean;
};

/** No placeholder exists for these, in any pronoun set. */
const REFLEXIVES = ['himself', 'herself', 'themselves', 'themself', 'hisself'];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every name this person is known by on the record, longest first.
 *
 * Longest first matters: "Alex Rivera" has to be consumed before "Alex", or
 * the surname is left stranded next to a placeholder.
 */
function nameParts(id: NameIdentity): string[] {
  const parts = [
    `${id.firstName} ${id.lastName}`,
    id.preferredName ?? '',
    id.firstName,
    id.lastName
  ]
    .map((p) => p.trim())
    .filter(Boolean);

  return [...new Set(parts)].sort((a, b) => b.length - a.length);
}

/**
 * Find the resident's names still present in a piece of text.
 *
 * Used twice: once after substitution in the browser, and once on the server
 * against whatever the supervisor finally submitted. The second one is the
 * load-bearing check — the first is only advice, since the text is editable
 * between them.
 */
export function findNames(text: string, id: NameIdentity): string[] {
  if (!text) return [];
  const found = nameParts(id).filter((part) =>
    new RegExp(`\\b${escapeRegExp(part)}\\b`, 'i').test(text)
  );
  // "Alex Rivera" already covers "Alex" and "Rivera"; report the specific ones.
  return found.filter((part) => !found.some((other) => other !== part && other.includes(part)));
}

/**
 * Pronoun word -> placeholder, with the genuinely ambiguous words removed.
 *
 * A word that belongs to two forms of the same person's pronouns ("her" for
 * she/her/her) is dropped from the map and reported instead. There is no way
 * to tell which one a sentence means without parsing English, and getting it
 * wrong writes the wrong word into a different person's plan on install.
 */
function pronounMap(p: Pronouns): Map<string, string> {
  const entries: Array<[string, string]> = [
    [p.subject.trim().toLowerCase(), '{subject}'],
    [p.object.trim().toLowerCase(), '{object}'],
    [p.possessive.trim().toLowerCase(), '{possessive}']
  ].filter(([word]) => word.length > 0) as Array<[string, string]>;

  const seen = new Map<string, string | null>();
  for (const [word, placeholder] of entries) {
    // Second sighting of the same word means it is ambiguous, not a duplicate.
    seen.set(word, seen.has(word) ? null : placeholder);
  }

  const map = new Map<string, string>();
  for (const [word, placeholder] of seen) {
    if (placeholder) map.set(word, placeholder);
  }
  return map;
}

function ambiguousPronouns(p: Pronouns): string[] {
  const words = [p.subject, p.object, p.possessive].map((w) => w.trim().toLowerCase());
  return [...new Set(words.filter((w, i) => w && words.indexOf(w) !== i))];
}

/** Replace one resident's name and pronouns with the library placeholders. */
export function depersonalize(text: string, id: NameIdentity): DepersonalizedText {
  if (!text) {
    return { text: '', residualNames: [], ambiguous: [], recasedPronoun: false };
  }

  let out = text;

  for (const part of nameParts(id)) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(part)}\\b`, 'gi'), '{name}');
  }

  let recasedPronoun = false;
  for (const [word, placeholder] of pronounMap(id.pronouns)) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi'), (match) => {
      // The placeholders expand lowercase, so a sentence that opened with
      // "He" would come back as "he". Flag it rather than silently reflowing
      // someone's sentence.
      if (match[0] === match[0].toUpperCase()) recasedPronoun = true;
      return placeholder;
    });
  }

  const ambiguous = [
    ...ambiguousPronouns(id.pronouns).filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(out)),
    ...REFLEXIVES.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(out))
  ];

  return { text: out, residualNames: findNames(out, id), ambiguous, recasedPronoun };
}

// ---------------------------------------------------------------------------
// A whole outcome
// ---------------------------------------------------------------------------

/** A preset as the supervisor is about to confirm it. Editable, not yet saved. */
export type PresetDraft = {
  title: string;
  category: string;
  lens: Outcome['lens'];
  importantTo: string;
  importantFor: string;
  statement: string;
  frequency: string;
  activities: Array<{
    description: string;
    measureType: OutcomeActivity['measureType'];
    measure: string;
    supportInstructions: string;
    dailyQuestion: string;
  }>;
};

export type PresetDraftResult = {
  draft: PresetDraft;
  /** Names left in the draft, deduplicated across every field. Blocks saving. */
  residualNames: string[];
  /** Words left alone on purpose, deduplicated. Worth a look, not a blocker. */
  ambiguous: string[];
  recasedPronoun: boolean;
};

/**
 * De-personalize an outcome and its activities in one pass.
 *
 * Support strategies and the progress measure on the outcome itself are not
 * carried: a preset installs through the starter-library path, which writes
 * the outcome and its activities and nothing else. The save screen says so
 * rather than dropping them quietly.
 */
export function draftPresetFrom(
  outcome: Outcome,
  activities: OutcomeActivity[],
  id: NameIdentity
): PresetDraftResult {
  const residualNames = new Set<string>();
  const ambiguous = new Set<string>();
  let recasedPronoun = false;

  const clean = (value: string | null | undefined): string => {
    const result = depersonalize(value ?? '', id);
    result.residualNames.forEach((n) => residualNames.add(n));
    result.ambiguous.forEach((w) => ambiguous.add(w));
    if (result.recasedPronoun) recasedPronoun = true;
    return result.text;
  };

  const draft: PresetDraft = {
    title: clean(outcome.title),
    category: outcome.category ?? '',
    lens: outcome.lens ?? null,
    importantTo: clean(outcome.importantTo),
    importantFor: clean(outcome.importantFor),
    statement: clean(outcome.statement),
    frequency: outcome.frequency ?? '',
    activities: activities.map((a) => ({
      description: clean(a.description),
      measureType: a.measureType,
      measure: clean(a.measure),
      supportInstructions: clean(a.supportInstructions),
      dailyQuestion: clean(a.dailyQuestion)
    }))
  };

  return {
    draft,
    residualNames: [...residualNames],
    ambiguous: [...ambiguous],
    recasedPronoun
  };
}

/** Every text field of a draft, for the server's final name check. */
export function draftTexts(draft: PresetDraft): string[] {
  return [
    draft.title,
    draft.category,
    draft.importantTo,
    draft.importantFor,
    draft.statement,
    draft.frequency,
    ...draft.activities.flatMap((a) => [
      a.description,
      a.measure,
      a.supportInstructions,
      a.dailyQuestion
    ])
  ];
}
