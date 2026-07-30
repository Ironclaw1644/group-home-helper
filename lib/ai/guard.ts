import type { FormTemplateSchema, StructuredData } from '@/lib/types';
import { getFieldValue } from '@/lib/forms/interpolate';

/**
 * Grounding checks on generated narrative.
 *
 * The model self-reports `unsupported_claims`, but a model that hallucinates is
 * not a reliable narrator of its own hallucinations. These checks are
 * deterministic and run over the finished text.
 *
 * They are deliberately narrow rather than a general word-diff: prose needs
 * connective language that appears nowhere in the structured input, so
 * flagging every unmatched word would bury the DSP in noise and train them to
 * dismiss the warning. Instead we look for the specific ways an invented
 * detail shows up in this particular document.
 */

/** Words that read as a specific clock time or duration. */
const TIME_PATTERNS = [
  /\b\d{1,2}:\d{2}\s?(a\.?m\.?|p\.?m\.?)?\b/i,
  /\b\d{1,2}\s?(a\.?m\.?|p\.?m\.?)\b/i,
  /\bfor (about |approximately |roughly )?\d+\s?(minutes?|hours?)\b/i
];

const QUOTE_PATTERN = /["“”].{3,}?["“”]/;

export type GroundingFinding = {
  kind:
    | 'unselected_option'
    | 'unrecorded_topic'
    | 'invented_time'
    | 'quoted_speech'
    | 'model_reported';
  detail: string;
};

/**
 * Whether the DSP recorded anything at all in a section.
 *
 * A `false` boolean does not count as recording something: "was there an
 * incident? no" is not a record of an incident.
 */
function sectionHasSelection(section: FormTemplateSchema['sections'][number], data: StructuredData): boolean {
  for (const field of section.fields) {
    const value = getFieldValue(data, section.key, field);
    if (Array.isArray(value) && value.length > 0) return true;
    if (typeof value === 'string' && value.trim() !== '') return true;
    if (typeof value === 'boolean' && value) return true;
  }
  return false;
}

/**
 * Topic-level grounding: a section with nothing recorded must not appear in
 * the narrative at all.
 *
 * This is the check that catches an invented meal. Per-option matching only
 * knows about words that are option labels, so a model writing "a nutritious
 * meal was provided and enjoyed" when no meal field was touched slips past it
 * — the giveaway word is "meal", which is nobody's option label.
 */
function findUnrecordedTopics(
  schema: FormTemplateSchema,
  data: StructuredData,
  narrative: string
): GroundingFinding[] {
  const text = narrative.toLowerCase();
  const findings: GroundingFinding[] = [];

  for (const section of schema.sections) {
    const vocabulary = section.grounding_vocabulary;
    if (!vocabulary || vocabulary.length === 0) continue;
    if (sectionHasSelection(section, data)) continue;

    const hits = vocabulary.filter((word) => containsWord(text, word.toLowerCase()));
    if (hits.length > 0) {
      findings.push({
        kind: 'unrecorded_topic',
        detail: `nothing was recorded under "${section.title}", but the note mentions ${hits
          .map((h) => `"${h}"`)
          .join(', ')}`
      });
    }
  }

  return findings;
}

/**
 * Everything the DSP typed, lowercased.
 *
 * Free text is input too, and the option checks below have no other way to know
 * about it. Without this the guard flags the DSP's own words back at them: a
 * DSP who writes "redirected by staff and calmed after a short time" on a shift
 * where the mood was Agitated gets the narrative flagged for mentioning "calm",
 * because Calm is an unselected option. The event is recorded, in their
 * handwriting, and the model is repeating it correctly.
 */
function recordedFreeText(data: StructuredData): string {
  const parts: string[] = [];
  for (const value of Object.values(data)) {
    if (typeof value === 'string' && value.trim()) parts.push(value);
  }
  return parts.join(' ').toLowerCase();
}

/**
 * Options the DSP did NOT select but which the narrative mentions anyway.
 *
 * This is the check that matters most: an invented outing or an invented meal
 * is the failure that would put a false statement in a billing record.
 */
function findUnselectedOptions(
  schema: FormTemplateSchema,
  data: StructuredData,
  narrative: string
): GroundingFinding[] {
  const text = narrative.toLowerCase();
  const typed = recordedFreeText(data);
  // Keywords from every option the DSP selected, across the whole form.
  const selectedWords = selectedKeywords(schema, data);
  const findings: GroundingFinding[] = [];

  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.type !== 'chips') continue;

      const selected = new Set(
        Array.isArray(getFieldValue(data, section.key, field))
          ? (getFieldValue(data, section.key, field) as string[])
          : []
      );

      for (const option of field.options) {
        if (selected.has(option.value)) continue;

        // Match on the distinctive noun in the option label rather than the
        // whole label, since the narrative will phrase it differently.
        const keyword = distinctiveKeyword(option.label);
        if (!keyword) continue;

        // Only flag if nothing the DSP selected anywhere on the form already
        // accounts for the word.
        //
        // Scoping this to the same field was a real bug, caught against
        // production: the meals option "Eaten at home" and the activity option
        // "Stayed home" share the keyword "home", so a resident who stayed home
        // produced a note flagged for mentioning a meal nobody recorded. A
        // spurious warning is worse than none — it teaches DSPs that the
        // review banner is noise.
        if (selectedWords.has(keyword)) continue;

        // The DSP wrote it themselves, so the model is not inventing it.
        // Matched as a stem so "calmed" in their text covers "calm" in the
        // narrative — paraphrasing free text is exactly what this step is for.
        if (typed.includes(keyword)) continue;

        if (containsWord(text, keyword)) {
          findings.push({
            kind: 'unselected_option',
            detail: `"${option.label}" was not selected, but the note mentions "${keyword}"`
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Every content word of every option selected anywhere on the form.
 *
 * All the words, not just the distinctive one: distinctiveKeyword() keeps the
 * longest, so "Stayed home" reduces to "stayed" while "Eaten at home" reduces
 * to "home". Comparing only those two would never see that both labels contain
 * "home", which is exactly the collision this set exists to resolve.
 */
function selectedKeywords(schema: FormTemplateSchema, data: StructuredData): Set<string> {
  const words = new Set<string>();

  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.type !== 'chips') continue;
      const value = getFieldValue(data, section.key, field);
      if (!Array.isArray(value)) continue;

      for (const option of field.options) {
        if (!value.includes(option.value)) continue;
        for (const word of contentWords(option.label)) words.add(word);
      }
    }
  }

  return words;
}

/**
 * Words carrying no signal in an option label — grammar, and verbs so common
 * across labels that matching on them would flag everything.
 */
const LABEL_STOP = new Set([
  'the', 'a', 'an', 'with', 'and', 'or', 'of', 'to', 'in', 'at', 'on', 'by',
  'staff', 'completed', 'required', 'appeared', 'about', 'yes', 'no',
  'declined', 'prepared', 'ate', 'used', 'part', 'his', 'her', 'their',
  'usual', 'routine', 'only', 'it', 'did', 'not', 'showed', 'signs',
  'already', 'needed', 'independently', 'hands', 'verbal', 'first', 'meal',
  'eaten', 'indicated', 'requested', 'offered', 'choices', 'is', 'was'
]);

/** Words in a label that could plausibly show up in prose. */
function contentWords(label: string): string[] {
  return label
    .toLowerCase()
    .replace(/\{[a-z]+\}/g, ' ')
    .replace(/[^a-z\s%]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !LABEL_STOP.has(w));
}

/**
 * Pull the content word from an option label — the part that would actually
 * appear in prose. Returns null for labels too generic to test on.
 */
function distinctiveKeyword(label: string): string | null {
  const words = label
    .toLowerCase()
    .replace(/\{[a-z]+\}/g, ' ')
    .replace(/[^a-z\s%]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !LABEL_STOP.has(w));

  // Longest remaining word is the most distinctive (museum, library, laundry).
  words.sort((a, b) => b.length - a.length);
  return words[0] ?? null;
}

function containsWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack);
}

/** Clock times and durations are never in the structured input. */
function findInventedTimes(narrative: string): GroundingFinding[] {
  for (const pattern of TIME_PATTERNS) {
    const match = narrative.match(pattern);
    if (match) {
      return [
        {
          kind: 'invented_time',
          detail: `mentions a specific time or duration ("${match[0].trim()}") that was not recorded`
        }
      ];
    }
  }
  return [];
}

/** The form never captures speech, so a quotation is always invented. */
function findQuotedSpeech(narrative: string): GroundingFinding[] {
  const match = narrative.match(QUOTE_PATTERN);
  return match
    ? [{ kind: 'quoted_speech', detail: `contains a quotation (${match[0].slice(0, 40)}…)` }]
    : [];
}

export function checkGrounding(params: {
  schema: FormTemplateSchema;
  data: StructuredData;
  narrative: string;
  modelReported: string[];
  /**
   * The resident's name, so the self-report check can ignore it. It appears in
   * every narrative and in no chip label, which would otherwise make every
   * self-report look like it named something unrecorded.
   */
  residentName?: string;
}): GroundingFinding[] {
  return [
    ...findUnselectedOptions(params.schema, params.data, params.narrative),
    ...findUnrecordedTopics(params.schema, params.data, params.narrative),
    ...findInventedTimes(params.narrative),
    ...findQuotedSpeech(params.narrative),
    ...findRealSelfReports(
      params.schema,
      params.data,
      params.narrative,
      params.modelReported,
      params.residentName
    )
  ];
}

/**
 * Keep only the self-reported claims that are actually claims.
 *
 * The model is asked to list anything it wrote that the input did not support.
 * Smaller models read that field loosely and use it to describe what they
 * *lacked* rather than what they *invented* — gpt-4o-mini returns entries like
 * "how Alex enjoyed the activity" on a shift where the narrative never says he
 * enjoyed anything, and "the mood was agitated" when Agitated was the recorded
 * mood.
 *
 * Taking those at face value fails a model for being conscientious in a
 * metadata field while its narrative is clean. So each entry is checked against
 * both sides before it counts:
 *
 *   - if everything it names was in the input, it is supported after all
 *   - if what it names is not in the narrative, the model is describing
 *     something it did not write
 *
 * What survives is a claim the model made and could not support, which is worth
 * showing a supervisor.
 */
function findRealSelfReports(
  schema: FormTemplateSchema,
  data: StructuredData,
  narrative: string,
  reported: string[],
  residentName?: string
): GroundingFinding[] {
  const text = narrative.toLowerCase();
  const recorded = (recordedFreeText(data) + ' ' + formVocabulary(schema, data)).toLowerCase();
  const ignore = new Set(SELF_REPORT_STOP);
  if (residentName) ignore.add(residentName.trim().toLowerCase());
  const findings: GroundingFinding[] = [];

  for (const claim of reported) {
    const trimmed = claim.trim();
    if (!trimmed) continue;

    const words = trimmed
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !ignore.has(w));

    // Nothing testable in it (e.g. "none", "n/a") — not evidence of anything.
    if (words.length === 0) continue;

    if (words.every((w) => recorded.includes(w))) continue;
    if (!words.some((w) => text.includes(w))) continue;

    findings.push({ kind: 'model_reported', detail: trimmed });
  }

  return findings;
}

/** Words that carry no evidence either way in a self-report. */
const SELF_REPORT_STOP = new Set([
  'that', 'this', 'with', 'from', 'have', 'been', 'were', 'about', 'there',
  'their', 'they', 'them', 'shift', 'note', 'staff', 'input', 'claim',
  'detail', 'details', 'specific', 'beyond', 'overall', 'during', 'which',
  'what', 'when', 'where'
]);

/**
 * The form's own words: section titles, field labels, and the option labels the
 * DSP selected.
 *
 * A self-report that only uses the form's vocabulary is describing the input,
 * not something invented — "the overall mood was agitated" is the model
 * restating a field label and a selected option, which is the opposite of a
 * fabrication.
 */
function formVocabulary(schema: FormTemplateSchema, data: StructuredData): string {
  const words: string[] = [];

  for (const section of schema.sections) {
    words.push(section.title);
    for (const field of section.fields) {
      words.push(field.label);
      if (field.type !== 'chips') continue;
      const value = getFieldValue(data, section.key, field);
      if (!Array.isArray(value)) continue;
      for (const option of field.options) {
        if (value.includes(option.value)) words.push(option.label);
      }
    }
  }

  return words.join(' ');
}

/**
 * The closing sentence is a factual claim about the shift, so it is enforced
 * from the data rather than trusted to the model.
 */
export function checkClosingSentence(narrative: string, hasConcern: boolean): GroundingFinding[] {
  const hasNoConcernCloser = /no problems or concerns during shift/i.test(narrative);
  if (hasConcern && hasNoConcernCloser) {
    return [
      {
        kind: 'model_reported',
        detail:
          'the note says there were no problems or concerns, but a concern was recorded this shift'
      }
    ];
  }
  return [];
}
