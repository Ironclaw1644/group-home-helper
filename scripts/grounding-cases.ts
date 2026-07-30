/**
 * The grounding test cases, shared by `verify:ai` and `compare:models`.
 *
 * Both scripts must judge a narrative identically — one is the pass/fail gate,
 * the other picks which model to pay for, and a model that looks good only
 * because the comparison graded it more leniently is worse than no comparison.
 */
import { buildDraftUserMessage } from '../lib/ai/prompts';
import { checkClosingSentence, checkGrounding } from '../lib/ai/guard';
import type { FormTemplateSchema, StructuredData } from '../lib/types';

export const schema: FormTemplateSchema = {
  prompts: [
    'Where did {name} choose to go?',
    'What did {name} do while there?',
    'How did {name} choose the activity?',
    'Did {subject} enjoy the activity?',
    'How did staff support {name}?'
  ],
  sections: [
    {
      key: 'start_of_shift',
      title: 'Start of shift',
      fields: [
        {
          key: 'waking',
          type: 'chips',
          label: 'How was {name} at the start of shift?',
          multiple: true,
          options: [
            { value: 'resting_comfortably', label: 'Asleep, resting comfortably' },
            { value: 'already_awake', label: 'Already awake' },
            { value: 'signs_of_distress', label: 'Showed signs of distress', flags_concern: true }
          ]
        },
        {
          key: 'adls',
          type: 'chips',
          label: 'ADLs (grooming, hygiene, dressing)',
          multiple: true,
          options: [
            { value: 'independent', label: 'Completed independently' },
            { value: 'verbal_prompts', label: 'Completed with verbal prompts' },
            { value: 'hands_on_assist', label: 'Required hands-on assistance' }
          ]
        }
      ]
    },
    {
      key: 'meals',
      title: 'Meals',
      grounding_vocabulary: [
        'meal', 'meals', 'ate', 'eating', 'eaten', 'food', 'breakfast',
        'lunch', 'dinner', 'snack', 'nutritious', 'well-balanced'
      ],
      fields: [
        {
          key: 'breakfast',
          type: 'chips',
          label: 'Breakfast',
          multiple: true,
          options: [
            { value: 'ate_100', label: 'Ate 100%' },
            { value: 'refused', label: 'Declined the meal', flags_concern: true }
          ]
        }
      ]
    },
    {
      key: 'activity',
      title: 'Activity and community',
      grounding_vocabulary: ['outing', 'transported', 'trip', 'visited', 'excursion'],
      fields: [
        {
          key: 'location',
          type: 'chips',
          label: 'Where did {name} choose to go?',
          prompt_ref: 1,
          multiple: true,
          options: [
            { value: 'stayed_home', label: 'Stayed home' },
            { value: 'museum', label: 'Museum' },
            { value: 'library', label: 'Library' },
            { value: 'park', label: 'Park' },
            { value: 'store', label: 'Store' }
          ]
        }
      ]
    },
    {
      key: 'status',
      title: 'Mood and concerns',
      fields: [
        {
          key: 'mood',
          type: 'chips',
          label: 'Overall mood',
          multiple: true,
          options: [
            { value: 'calm', label: 'Calm' },
            { value: 'agitated', label: 'Agitated', flags_concern: true }
          ]
        },
        {
          key: 'incident',
          type: 'boolean',
          label: 'Was there an incident?',
          flags_concern_when_true: true
        },
        {
          key: 'incident_detail',
          type: 'text',
          label: 'Describe the incident or concern',
          multiline: true
        }
      ]
    }
  ],
  narrative: { key: 'narrative', type: 'narrative', label: 'Progress note' },
  signature: { key: 'signature', type: 'signature', attestation: 'I attest…' }
};

export const pronouns = { subject: 'he', object: 'him', possessive: 'his' };

/** Verbatim wording from the style exemplar. None of it belongs in a note. */
const EXEMPLAR_TELLS = [
  'awakened',
  'greeted staff',
  'light housekeeping',
  'art exhibits',
  'well-balanced',
  'nutritious dinner'
];

export type Case = {
  title: string;
  data: StructuredData;
  selections: Array<{ section: string; field: string; promptRef?: number; values: string[] }>;
  hasConcern: boolean;
  /** Events that did not happen, so must not appear. */
  forbidden: string[];
};

export const CASES: Case[] = [
  {
    title: 'Thin input — stayed home, calm, no incident',
    data: {
      'start_of_shift.waking': ['resting_comfortably'],
      'start_of_shift.adls': ['verbal_prompts'],
      'activity.location': ['stayed_home'],
      'status.mood': ['calm'],
      'status.incident': false
    },
    selections: [
      { section: 'Start of shift', field: 'How was Alex at the start of shift?', values: ['Asleep, resting comfortably'] },
      { section: 'Start of shift', field: 'ADLs (grooming, hygiene, dressing)', values: ['Completed with verbal prompts'] },
      { section: 'Activity and community', field: 'Where did Alex choose to go?', promptRef: 1, values: ['Stayed home'] },
      { section: 'Mood and concerns', field: 'Overall mood', values: ['Calm'] }
    ],
    hasConcern: false,
    // No meal, outing, or visitor was recorded.
    forbidden: ['museum', 'library', 'park', 'store', 'breakfast', 'lunch', 'dinner', 'family', 'nurse']
  },
  {
    title: 'Incident flagged — park, agitated',
    data: {
      'activity.location': ['park'],
      'status.mood': ['agitated'],
      'status.incident': true,
      'status.incident_detail':
        'Became upset when the walking path was closed; redirected by staff and calmed after a short time.'
    },
    selections: [
      { section: 'Activity and community', field: 'Where did Alex choose to go?', promptRef: 1, values: ['Park'] },
      { section: 'Mood and concerns', field: 'Overall mood', values: ['Agitated'] },
      {
        section: 'Mood and concerns',
        field: 'Describe the incident or concern',
        values: ['Became upset when the walking path was closed; redirected by staff and calmed after a short time.']
      }
    ],
    hasConcern: true,
    forbidden: ['museum', 'library', 'store', 'breakfast', 'dinner']
  }
];

export function buildMessage(testCase: Case): string {
  return buildDraftUserMessage({
    residentName: 'Alex',
    pronouns,
    shiftLabel: '7AM-7PM',
    hasConcern: testCase.hasConcern,
    selections: testCase.selections,
    prompts: schema.prompts.map((p) =>
      p.replace(/\{name\}/g, 'Alex').replace(/\{subject\}/g, 'he')
    )
  });
}

function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`, 'i').test(haystack);
}

/**
 * Judge one finished narrative. Returns the problems found; empty means pass.
 *
 * `narrative` must already have been through finalizeNarrative(), the same as
 * in the route — grading a raw model response would fail models on a closing
 * sentence that production adds for them.
 */
export function evaluateRun(
  testCase: Case,
  narrative: string,
  modelReported: string[]
): string[] {
  const problems: string[] = [];

  const invented = testCase.forbidden.filter((w) => hasWord(narrative, w));
  if (invented.length) problems.push(`invented: ${invented.join(', ')}`);

  const leaks = EXEMPLAR_TELLS.filter((w) => narrative.toLowerCase().includes(w));
  if (leaks.length) problems.push(`copied exemplar wording: ${leaks.join(', ')}`);

  const closerUsed = /no problems or concerns during shift/i.test(narrative);
  if (testCase.hasConcern && closerUsed) {
    problems.push('used the no-concerns closer on a shift with a concern');
  }
  if (!testCase.hasConcern && !closerUsed) {
    problems.push('omitted the standard closing sentence');
  }

  // The same guards that run in production.
  const findings = [
    ...checkGrounding({ schema, data: testCase.data, narrative, modelReported, residentName: 'Alex' }),
    ...checkClosingSentence(narrative, testCase.hasConcern)
  ];
  for (const f of findings) problems.push(`guard [${f.kind}]: ${f.detail}`);

  return problems;
}
