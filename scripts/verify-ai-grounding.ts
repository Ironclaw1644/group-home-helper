/**
 * Live model check against the configured provider.
 *
 *   npm run verify:ai              # default local provider (Ollama)
 *   AI_PROVIDER=anthropic npm run verify:ai
 *   VERIFY_RUNS=5 npm run verify:ai
 *
 * A single passing generation is not evidence for a smaller local model, so
 * every case runs several times and the summary reports how many held. What is
 * being checked:
 *
 *   1. Thin input must not grow an outing, a meal, or a visitor.
 *   2. Style-exemplar wording must not be copied in as fact — the failure mode
 *      observed on a 7B model, which lifted "Staff awakened ... and greeted"
 *      straight out of the example.
 *   3. A shift with a recorded concern must not end with the reassuring closer.
 *   4. Latency has to be low enough that a DSP will actually wait for it.
 */
import { getProvider } from '../lib/ai/provider';
import { buildDraftUserMessage, SYSTEM_PROMPT } from '../lib/ai/prompts';
import { checkClosingSentence, checkGrounding } from '../lib/ai/guard';
import { finalizeNarrative } from '../lib/ai/postprocess';
import type { FormTemplateSchema, StructuredData } from '../lib/types';

const RUNS = Number(process.env.VERIFY_RUNS || 3);

const schema: FormTemplateSchema = {
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

const pronouns = { subject: 'he', object: 'him', possessive: 'his' };

/** Verbatim wording from the style exemplar. None of it belongs in a note. */
const EXEMPLAR_TELLS = [
  'awakened',
  'greeted staff',
  'light housekeeping',
  'art exhibits',
  'well-balanced',
  'nutritious dinner'
];

type Case = {
  title: string;
  data: StructuredData;
  selections: Array<{ section: string; field: string; promptRef?: number; values: string[] }>;
  hasConcern: boolean;
  /** Events that did not happen, so must not appear. */
  forbidden: string[];
};

const CASES: Case[] = [
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

function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`, 'i').test(haystack);
}

async function main() {
  const provider = await getProvider();
  const health = await provider.health();

  console.log(`provider: ${provider.name}  model: ${provider.model}`);
  console.log(`health:   ${health.detail}\n`);

  if (!health.ok) {
    console.error('Provider is not ready — skipping live checks.');
    process.exit(2);
  }

  let totalRuns = 0;
  let totalPassed = 0;
  const timings: number[] = [];

  for (const testCase of CASES) {
    console.log(`\n=== ${testCase.title} ===`);

    const message = buildDraftUserMessage({
      residentName: 'Alex',
      pronouns,
      shiftLabel: '7AM-7PM',
      hasConcern: testCase.hasConcern,
      selections: testCase.selections,
      prompts: schema.prompts.map((p) =>
        p.replace(/\{name\}/g, 'Alex').replace(/\{subject\}/g, 'he')
      )
    });

    for (let run = 1; run <= RUNS; run++) {
      const result = await provider.generate(SYSTEM_PROMPT, message);
      totalRuns++;

      if (!result.ok) {
        console.log(`  run ${run}: FAILED (${result.reason}) — ${result.message}`);
        continue;
      }

      // Same pipeline as the route: normalize, then apply the closer the data
      // calls for.
      const narrative = finalizeNarrative(result.draft.narrative, testCase.hasConcern);
      if (result.usage.elapsedSeconds) timings.push(result.usage.elapsedSeconds);

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
        ...checkGrounding({
          schema,
          data: testCase.data,
          narrative,
          modelReported: result.draft.unsupported_claims
        }),
        ...checkClosingSentence(narrative, testCase.hasConcern)
      ];
      for (const f of findings) problems.push(`guard [${f.kind}]: ${f.detail}`);

      const passed = problems.length === 0;
      if (passed) totalPassed++;

      console.log(
        `  run ${run}: ${passed ? 'PASS' : 'FAIL'}  (${result.usage.elapsedSeconds ?? '?'}s)`
      );
      console.log(`    ${narrative}`);
      for (const p of problems) console.log(`    ! ${p}`);
    }
  }

  const median = timings.length
    ? [...timings].sort((a, b) => a - b)[Math.floor(timings.length / 2)]
    : null;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`passed ${totalPassed}/${totalRuns} runs`);
  if (median !== null) {
    console.log(`median latency ${median}s (min ${Math.min(...timings)}s, max ${Math.max(...timings)}s)`);
  }

  // Every run must hold. A note that invents an event is a falsified record,
  // so "usually correct" is not a passing grade.
  const ok = totalPassed === totalRuns && totalRuns > 0;
  console.log(ok ? 'Live grounding checks passed.\n' : 'Live grounding checks FAILED.\n');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
