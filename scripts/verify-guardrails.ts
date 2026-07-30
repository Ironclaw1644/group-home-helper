/**
 * Offline checks for the safety-critical pure logic.
 *
 *   npm run verify:guardrails
 *
 * These are the properties that must hold whether or not the model behaves:
 * grounding detection, the concern-closer rule, de-identification, and
 * duplicate detection. None of them need an API key or a database, so they
 * should be run on every change.
 */
import { checkClosingSentence, checkGrounding } from '../lib/ai/guard';
import { findResidualIdentifiers, prepareName, scrubFreeText } from '../lib/ai/deid';
import { narrativeSimilarity, isLikelyDuplicate } from '../lib/notes/similarity';
import { describeSelections, shiftHasConcern } from '../lib/forms/interpolate';
import type { FormTemplateSchema, StructuredData } from '../lib/types';

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

// A trimmed template that mirrors the seeded Form #680 shape.
const schema: FormTemplateSchema = {
  prompts: ['Where did {name} choose to go?'],
  sections: [
    {
      key: 'activity',
      title: 'Activity',
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
            { value: 'park', label: 'Park' }
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
        }
      ]
    }
  ],
  narrative: { key: 'narrative', type: 'narrative', label: 'Progress note' },
  signature: { key: 'signature', type: 'signature', attestation: 'I attest…' }
};

const ctx = {
  name: 'Alex',
  pronouns: { subject: 'he', object: 'him', possessive: 'his' }
};

// ---------------------------------------------------------------------------
section('Grounding: an invented outing is caught');
// ---------------------------------------------------------------------------
{
  const data: StructuredData = { 'activity.location': ['stayed_home'] };

  const inventedMuseum = checkGrounding({
    schema,
    data,
    narrative:
      'Alex remained at home this morning. Alex was transported to the museum where he enjoyed the exhibits.',
    modelReported: []
  });
  check(
    'flags a museum trip that was never selected',
    inventedMuseum.some((f) => f.kind === 'unselected_option' && /museum/i.test(f.detail)),
    JSON.stringify(inventedMuseum)
  );

  const faithful = checkGrounding({
    schema,
    data,
    narrative:
      'Alex remained at home this shift and enjoyed relaxing. There were no problems or concerns during shift.',
    modelReported: []
  });
  check('does not flag a faithful note', faithful.length === 0, JSON.stringify(faithful));
}

// ---------------------------------------------------------------------------
section('Grounding: invented times and quotes');
// ---------------------------------------------------------------------------
{
  const data: StructuredData = { 'activity.location': ['park'] };

  const withTime = checkGrounding({
    schema,
    data,
    narrative: 'Alex went to the park at 2:30 PM and returned home.',
    modelReported: []
  });
  check(
    'flags a specific clock time',
    withTime.some((f) => f.kind === 'invented_time'),
    JSON.stringify(withTime)
  );

  const withDuration = checkGrounding({
    schema,
    data,
    narrative: 'Alex walked in the park for about 45 minutes.',
    modelReported: []
  });
  check(
    'flags an invented duration',
    withDuration.some((f) => f.kind === 'invented_time'),
    JSON.stringify(withDuration)
  );

  const withQuote = checkGrounding({
    schema,
    data,
    narrative: 'Alex went to the park and said "I had a wonderful time today" to staff.',
    modelReported: []
  });
  check(
    'flags quoted speech',
    withQuote.some((f) => f.kind === 'quoted_speech'),
    JSON.stringify(withQuote)
  );
}

// ---------------------------------------------------------------------------
section('Concern rule: the closing sentence follows the data');
// ---------------------------------------------------------------------------
{
  const calm: StructuredData = { 'status.mood': ['calm'], 'status.incident': false };
  const agitated: StructuredData = { 'status.mood': ['agitated'], 'status.incident': false };
  const incident: StructuredData = { 'status.mood': ['calm'], 'status.incident': true };

  check('a calm shift has no concern', shiftHasConcern(schema, calm) === false);
  check('an agitated mood raises a concern', shiftHasConcern(schema, agitated) === true);
  check('an incident raises a concern', shiftHasConcern(schema, incident) === true);

  const wrongCloser = checkClosingSentence(
    'Alex was agitated during the afternoon. There were no problems or concerns during shift.',
    true
  );
  check(
    'flags the no-concerns closer on a shift that had a concern',
    wrongCloser.length === 1,
    JSON.stringify(wrongCloser)
  );

  const rightCloser = checkClosingSentence(
    'Alex was calm throughout. There were no problems or concerns during shift.',
    false
  );
  check('allows the closer on a clean shift', rightCloser.length === 0);
}

// ---------------------------------------------------------------------------
section('De-identification (AI_DEIDENTIFY=true)');
// ---------------------------------------------------------------------------
{
  process.env.AI_DEIDENTIFY = 'true';

  const { outboundName, rehydrate } = prepareName('Alex');
  check('the real first name is not sent', outboundName !== 'Alex', outboundName);

  const modelOutput =
    'This morning R. was observed resting comfortably. Staff greeted R., and R. greeted staff in return.';
  const restored = rehydrate(modelOutput);
  check(
    'the real name is restored locally',
    restored.includes('Alex') && !restored.includes('R.'),
    restored
  );
  check(
    'sentence punctuation survives rehydration',
    restored ===
      'This morning Alex was observed resting comfortably. Staff greeted Alex, and Alex greeted staff in return.',
    restored
  );

  check('scrubs a Medicaid-length id', scrubFreeText('id 109016522050 noted') === 'id [id] noted');
  check('scrubs a date', scrubFreeText('fell on 06/01/2026') === 'fell on [date]');
  check('scrubs a phone number', scrubFreeText('call 555-123-4567') === 'call [phone]');

  const leaky = 'Resident Alex Sample, Medicaid 109016522050, went out.';
  const residual = findResidualIdentifiers(leaky, ['Alex', 'Sample', '109016522050']);
  check('detects identifiers left in an outbound payload', residual.length === 3, JSON.stringify(residual));

  const clean = 'Resident R. went out.';
  check(
    'passes a clean payload',
    findResidualIdentifiers(clean, ['Alex', 'Sample', '109016522050']).length === 0
  );
}

// ---------------------------------------------------------------------------
section('De-identification disabled (post-BAA)');
// ---------------------------------------------------------------------------
{
  process.env.AI_DEIDENTIFY = 'false';
  const { outboundName } = prepareName('Alex');
  check('the real name is sent once BAAs are in place', outboundName === 'Alex');
  check('free text passes through unscrubbed', scrubFreeText('id 109016522050') === 'id 109016522050');
  process.env.AI_DEIDENTIFY = 'true';
}

// ---------------------------------------------------------------------------
section('Duplicate detection');
// ---------------------------------------------------------------------------
{
  const yesterday =
    'This morning Alex was observed in bed, asleep appearing to be resting comfortably. Staff awakened Alex and greeted him. Alex ate 100% of his meal with no problem. There were no problems or concerns during shift.';

  check('identical text scores 1.0', narrativeSimilarity(yesterday, yesterday) === 1);
  check('identical text is a duplicate', isLikelyDuplicate(narrativeSimilarity(yesterday, yesterday)));

  const copyPasted = yesterday.replace('100%', '75%');
  check(
    'a one-word edit still reads as a duplicate',
    isLikelyDuplicate(narrativeSimilarity(copyPasted, yesterday)),
    String(narrativeSimilarity(copyPasted, yesterday))
  );

  const genuinelyDifferent =
    'Alex chose to visit the library this afternoon, where he browsed magazines and spoke with staff about his week. A nutritious dinner was served at home and enjoyed. There were no problems or concerns during shift.';
  check(
    'a genuinely different day is not a duplicate',
    !isLikelyDuplicate(narrativeSimilarity(genuinelyDifferent, yesterday)),
    String(narrativeSimilarity(genuinelyDifferent, yesterday))
  );
}

// ---------------------------------------------------------------------------
section('Selection flattening (what the model receives)');
// ---------------------------------------------------------------------------
{
  const data: StructuredData = {
    'activity.location': ['museum'],
    'status.mood': ['calm'],
    'status.incident': false
  };

  const described = describeSelections(schema, data, ctx);
  const flat = JSON.stringify(described);

  check('includes the selected location', flat.includes('Museum'));
  check('omits unselected locations', !flat.includes('Library') && !flat.includes('Park'));
  check('omits a false boolean rather than sending "no"', !flat.includes('incident'));
  check(
    'carries the prompt number so the model can answer the printed question',
    described.some((d) => d.promptRef === 1)
  );
}

console.log(
  failures === 0
    ? '\nAll guardrail checks passed.\n'
    : `\n${failures} guardrail check(s) FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
