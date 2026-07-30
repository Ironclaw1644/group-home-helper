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

        // Only flag if no selected option in the same field already covers the
        // word — otherwise "ate 100%" and "ate about 75%" flag each other.
        const coveredBySelection = field.options.some(
          (o) => selected.has(o.value) && distinctiveKeyword(o.label) === keyword
        );
        if (coveredBySelection) continue;

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
 * Pull the content word from an option label — the part that would actually
 * appear in prose. Returns null for labels too generic to test on.
 */
function distinctiveKeyword(label: string): string | null {
  const stop = new Set([
    'the', 'a', 'an', 'with', 'and', 'or', 'of', 'to', 'in', 'at', 'on', 'by',
    'staff', 'completed', 'required', 'appeared', 'about', 'yes', 'no',
    'declined', 'prepared', 'ate', 'used', 'part', 'his', 'her', 'their',
    'usual', 'routine', 'only', 'it', 'did', 'not', 'showed', 'signs',
    'already', 'needed', 'independently', 'hands', 'verbal', 'first', 'meal',
    'eaten', 'indicated', 'requested', 'offered', 'choices', 'is', 'was'
  ]);

  const words = label
    .toLowerCase()
    .replace(/\{[a-z]+\}/g, ' ')
    .replace(/[^a-z\s%]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));

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
}): GroundingFinding[] {
  return [
    ...findUnselectedOptions(params.schema, params.data, params.narrative),
    ...findUnrecordedTopics(params.schema, params.data, params.narrative),
    ...findInventedTimes(params.narrative),
    ...findQuotedSpeech(params.narrative),
    ...params.modelReported
      .filter((c) => c.trim().length > 0)
      .map((c): GroundingFinding => ({ kind: 'model_reported', detail: c }))
  ];
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
