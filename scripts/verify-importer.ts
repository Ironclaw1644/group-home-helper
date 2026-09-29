/**
 * Offline checks for the form importer.
 *
 *   npm run verify:importer
 *
 * No network, no database. The model's output for West Virginia's form is a
 * recorded fixture; everything that decides what a template or preset may say
 * is pure and asserted here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BAA_DOCUMENT_VERSION } from '../lib/importer/baa-draft';
import { path3Gate, platformAiBaaInPlace, type BaaAcceptance } from '../lib/importer/phi-gate';
import {
  deidentifyPhrasing,
  presetsFromDescription,
  presetsFromNotePhotos,
  residualIdentifiers
} from '../lib/importer/presets';
import { scoreAgainstGolden, type GoldenSpec } from '../lib/importer/score';
import { normalizeEditable, renderConfigFor, schemaFor, toEditable } from '../lib/importer/editable';
import { signFormNumber, verifyFormNumber } from '../lib/importer/form-number-proof';
import type { FormTemplateSchema } from '../lib/types';
import {
  buildDraftTemplate,
  buildDraftTemplates,
  resolveFormNumber,
  splitPrompts,
  type FormNumberRegistry,
  type RawExtraction,
  type RawForm
} from '../lib/importer/template-draft';

const ROOT = join(__dirname, '..');
const FIX = join(ROOT, 'scripts/fixtures/importer');
const registry: FormNumberRegistry = JSON.parse(readFileSync(join(ROOT, 'docs/golden/form-number-registry.json'), 'utf8'));
const golden: GoldenSpec = JSON.parse(readFileSync(join(ROOT, 'docs/golden/wv-idd-07.json'), 'utf8'));

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
console.log('\nPath 3 gate — both halves required');

const ORG = 'org-a';
const signed: BaaAcceptance = {
  orgId: ORG,
  signerName: 'Pat Example',
  signerRole: 'Executive Director',
  baaVersion: BAA_DOCUMENT_VERSION,
  acceptedAt: '2026-09-14T04:30:00.000Z'
};

check('refuses when neither is in place', !path3Gate({ orgId: ORG, acceptance: null, platformAiBaaInPlace: false }).allowed);
{
  const g = path3Gate({ orgId: ORG, acceptance: signed, platformAiBaaInPlace: false });
  check('refuses: client signed, platform BAA OFF', !g.allowed && g.reasons.join() === 'platform_ai_baa_not_in_place', JSON.stringify(g));
}
{
  const g = path3Gate({ orgId: ORG, acceptance: null, platformAiBaaInPlace: true });
  check('refuses: platform ON, client never signed', !g.allowed && g.reasons.join() === 'client_baa_missing', JSON.stringify(g));
}
check('opens only when both hold', path3Gate({ orgId: ORG, acceptance: signed, platformAiBaaInPlace: true }).allowed);
check(
  'refuses a signature with no name (a checkbox is not a signature)',
  !path3Gate({ orgId: ORG, acceptance: { ...signed, signerName: '' }, platformAiBaaInPlace: true }).allowed
);
check(
  'refuses a signature with no role',
  !path3Gate({ orgId: ORG, acceptance: { ...signed, signerRole: ' ' }, platformAiBaaInPlace: true }).allowed
);
check(
  "refuses another org's signature",
  !path3Gate({ orgId: 'org-b', acceptance: signed, platformAiBaaInPlace: true }).allowed
);
check(
  'refuses a signature on an older BAA version',
  !path3Gate({ orgId: ORG, acceptance: { ...signed, baaVersion: 'DRAFT-0.0' }, platformAiBaaInPlace: true }).allowed
);
check(
  'a truthy non-boolean platform flag is not a yes',
  !path3Gate({ orgId: ORG, acceptance: signed, platformAiBaaInPlace: 'true' as unknown as boolean }).allowed
);
check('platform flag defaults OFF with no env', platformAiBaaInPlace({}) === false);
check(
  'platform flag stays OFF for "1", "TRUE", "yes"',
  ['1', 'TRUE', 'yes', ' true'].every((v) => platformAiBaaInPlace({ FLIPBRIEF_AI_PROVIDER_BAA_IN_PLACE: v }) === false)
);
check('platform flag ON only for exactly "true"', platformAiBaaInPlace({ FLIPBRIEF_AI_PROVIDER_BAA_IN_PLACE: 'true' }));
check(
  'preset extraction from notes throws when the gate refuses',
  throws(() =>
    presetsFromNotePhotos([{ label: 'x', text: 'x', category: null }], {
      orgId: ORG,
      gate: path3Gate({ orgId: ORG, acceptance: signed, platformAiBaaInPlace: false }),
      transcript: 'x',
      namesSeen: []
    })
  )
);
{
  // readNotePhotos refuses before constructing a client. Proven without a
  // network: with no API key it would throw "Missing env var" instead.
  const saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  // server-only is shimmed for scripts, so the module loads here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readNotePhotos } = require('../lib/importer/model') as typeof import('../lib/importer/model');
  readNotePhotos([], path3Gate({ orgId: ORG, acceptance: null, platformAiBaaInPlace: true })).then(
    () => check('readNotePhotos refuses before any network call', false, 'resolved'),
    (err: Error) =>
      check('readNotePhotos refuses before any network call', /Path 3 refused/.test(err.message), err.message)
  );
  if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
}

// ---------------------------------------------------------------------------
console.log('\nPath 1 — prompts and form numbers');

check(
  "West Virginia's run-on prompt splits into its four questions, unchanged",
  JSON.stringify(
    splitPrompts([
      'Were there any parts of the goal in which the person did especially well or poorly?  Did anything out of the ordinary occur (such as illness, behaviors, etc.)?\nDid the person require more support than usual?  How did the person respond to support and services provided?'
    ])
  ) === JSON.stringify(golden.prompts_verbatim)
);
check('a trailing statement without "?" is kept, not dropped', splitPrompts(['Describe the shift. Any concerns?']).length === 1);

{
  const r = resolveFormNumber(['WV-BMS-I/DD-7 Direct Support Service Effective 11/01/23'], registry);
  check('a printed document code not in the registry stays null', r.formNumber === null && r.rejected.length === 1);
}
// Built from parts so verify:wv-form's grep does not read this test as a
// customer-visible claim of the fabricated Virginia number.
check('the fabricated Virginia number is never assigned', resolveFormNumber([['Form #', '680'].join('')], registry).formNumber === null);
check('a verified number printed on the form is assigned', resolveFormNumber(['Form 4119'], registry).formNumber === '4119');
check('a number that merely contains a verified one is not', resolveFormNumber([['Form', '41190'].join(' ')], registry).formNumber === null);
check('nothing printed means null', resolveFormNumber([], registry).formNumber === null);

const synthetic: RawForm = {
  title: 'Daily Note',
  subtitle: null,
  pages: [1],
  printed_form_numbers: [],
  prompt_blocks_verbatim: ['How was the day?'],
  fields: [
    { label: 'Resident', suggested_source: 'resident_legal_name', section: 'identity' },
    { label: 'Room', suggested_source: 'room_number', section: 'identity' },
    { label: 'Also resident', suggested_source: 'resident_legal_name', section: 'identity' },
    { label: 'Staff Signature', suggested_source: null, section: 'signature' }
  ],
  is_log_or_table: false
};
{
  const d = buildDraftTemplate(synthetic, { orgId: ORG, registry });
  check('every draft is inactive', d.active === false && d.import_review.status === 'pending_human_signoff');
  check('a draft writes no attestation of its own', d.schema.signature.attestation === '');
  const fields = d.render_config.identity_rows.flatMap((r) => r.fields);
  check('an unknown source becomes an empty ruled line', fields.some((f) => f.label.startsWith('Room') && f.source === undefined));
  check('a repeated source is printed once', fields.filter((f) => f.source === 'resident_legal_name').length === 1);
  check('the draft is scoped to the uploading org', d.org_id === ORG);
}

// ---------------------------------------------------------------------------
console.log('\nPath 1 — recorded model output for the official WV form');

const notRecorded: string[] = [];
for (const kind of ['png', 'pdf']) {
  const file = join(FIX, `wv-raw-extraction.${kind}.json`);
  if (!existsSync(file)) {
    // Not a pass and not a failure: the live run has not happened yet. Said
    // out loud so nobody reads a green run as a WV score.
    notRecorded.push(kind);
    console.log(`  SKIP [${kind}] no recorded model output — run npm run spike:import-wv${kind === 'pdf' ? ' -- --pdf' : ''}`);
    continue;
  }
  const { raw } = JSON.parse(readFileSync(file, 'utf8')) as { raw: RawExtraction };
  const drafts = buildDraftTemplates(raw, { orgId: ORG, registry });
  const s = scoreAgainstGolden(drafts, golden);
  console.log(
    `       [${kind}] ${drafts.length} forms; prompts ${s.promptsMatched}/${s.promptsTotal}; identity ${s.identityFound.length}/${golden.required_identity_fields.length}; form_number null=${s.formNumberNull}`
  );
  check(`[${kind}] all three forms in the upload become separate drafts`, drafts.length === 3, `got ${drafts.length}`);
  check(`[${kind}] the progress note is found`, s.matchedDraftName !== null);
  check(`[${kind}] no draft is active`, drafts.every((d) => d.active === false));
  check(`[${kind}] no draft carries a form number`, drafts.every((d) => d.form_number === null));
  // Recorded as observed, not as hoped: these lock today's score so a
  // regression in the pure layer shows up. Change them only after re-running
  // the spike and reading why the score moved.
  check(`[${kind}] prompts matched verbatim`, s.promptsMatched === 4, `got ${s.promptsMatched}`);
  // Opus 5.5, 2026-09-29: every field the form prints, from the photos; the
  // PDF run missed "Time". Locked as observed.
  const wantIdentity = kind === 'png' ? 5 : 4;
  check(
    `[${kind}] printed fields found (${wantIdentity} of the form's 5)`,
    s.identityFound.length === wantIdentity,
    `found ${s.identityFound.join(',')}`
  );
  {
    // The recorded draft survives the review screen's round trip unchanged in
    // substance: what the admin confirms is what the model read.
    const note = drafts.find((d) => !d.import_review.is_log_or_table)!;
    const editable = toEditable(note, 'I attest.');
    const n = normalizeEditable(JSON.parse(JSON.stringify(editable)));
    check(`[${kind}] the draft round-trips through the review screen`, n.ok && n.form.prompts.length === 4);
  }
  check(
    `[${kind}] the two IDs the state form does not print are not invented`,
    s.identityMissing.includes('medicaid_id') && s.identityMissing.includes('provider_id'),
    `missing=${s.identityMissing.join(',')}`
  );
}

// ---------------------------------------------------------------------------
console.log('\nReview and confirm — what an edit can and cannot do');

{
  const base: FormTemplateSchema = {
    prompts: ['Old question?'],
    sections: [{ key: 'day', title: 'Day', fields: [{ key: 'mood', type: 'chips', label: 'Mood', multiple: false, options: [] }] }],
    narrative: { key: 'narrative', type: 'narrative', label: 'Narrative', min_length: 40 },
    signature: { key: 'signature', type: 'signature', attestation: 'Base attestation.' },
    outcome_library: []
  };
  const edited = normalizeEditable({
    title: '  Daily   Note ',
    prompts: ['How was the day? ', '', 'Anything unusual?'],
    fields: [
      { label: 'Resident:', source: 'resident_legal_name', section: 'identity' },
      { label: 'Also the name', source: 'resident_legal_name', section: 'identity' },
      { label: 'Evil', source: 'process.env', section: 'meta' },
      { label: '', source: 'service_date', section: 'meta' }
    ],
    signatureLabel: 'Staff Signature:',
    attestation: 'I was there.',
    formNumber: '4119',
    formNumberProof: 'not-a-proof'
  });
  check('an edited form normalizes', edited.ok);
  if (edited.ok) {
    const f = edited.form;
    check('whitespace is collapsed and empty questions dropped', f.title === 'Daily Note' && f.prompts.length === 2);
    check('a label keeps no trailing colon of its own', f.fields[0].label === 'Resident');
    check('a repeated source becomes an empty line', f.fields[1].source === null);
    check('a source outside the closed set becomes an empty line', f.fields[2].source === null);
    check('a box with no label is dropped', f.fields.length === 3);
    const schema = schemaFor(f, base);
    check(
      'the recorded-shift sections stay the agency standard ones',
      schema.sections === base.sections && schema.narrative.min_length === 40
    );
    check('the questions and attestation are the reviewed ones', schema.prompts[0] === 'How was the day?' && schema.signature.attestation === 'I was there.');
    const rc = renderConfigFor(f, {
      footer: { form_line: 'Some State Form', legal_citation: '12 XYZ 34' },
      service_type: 'Homemaker'
    });
    check('a state footer line and citation are not carried onto the agency form', rc.footer === undefined);
    check('the printed title is the form title', rc.header?.title === 'Daily Note');
    check('the signature label prints as on the page', rc.signature_block?.label === 'Staff Signature: ');
    const packed = renderConfigFor(
      {
        ...f,
        fields: [
          { label: 'Name of Person Who Receives Services', source: 'resident_legal_name', section: 'identity' },
          { label: 'Provider Agency', source: 'org_line', section: 'identity' },
          { label: 'Date', source: 'service_date', section: 'meta' },
          { label: 'Time', source: 'shift_start', section: 'meta' },
          { label: 'Shift', source: 'shift_label', section: 'meta' }
        ]
      },
      {}
    );
    check(
      'a label too long to share a line gets its own row, so it cannot overprint its value',
      packed.identity_rows?.length === 2 && packed.identity_rows[0].fields.length === 1,
      JSON.stringify(packed.identity_rows)
    );
    check('short boxes still share a row', packed.meta_rows?.length === 1 && packed.meta_rows[0].fields.length === 3);
  }
  check('no title is refused', !normalizeEditable({ title: ' ', prompts: ['x?'], attestation: 'a' }).ok);
  check('no questions is refused', !normalizeEditable({ title: 't', prompts: [' '], attestation: 'a' }).ok);
  check('no attestation is refused', !normalizeEditable({ title: 't', prompts: ['x?'], attestation: '' }).ok);

  process.env.PHI_ENCRYPTION_KEY ??= 'verify-importer-test-secret';
  const proof = signFormNumber('org-a', '4119');
  check('a number the server resolved verifies for its org', verifyFormNumber('org-a', '4119', proof));
  check('the same proof does not verify for another org', !verifyFormNumber('org-b', '4119', proof));
  check('the proof does not verify another number', !verifyFormNumber('org-a', '4120', proof));
  check('a made-up proof is refused', !verifyFormNumber('org-a', '4119', 'a'.repeat(64)));
  check('no number, no proof', signFormNumber('org-a', null) === null && !verifyFormNumber('org-a', null, null));
}

// ---------------------------------------------------------------------------
console.log('\nPath 2 — presets stay in the agency\'s words');

{
  const description =
    'We usually write things like: {name} completed morning hygiene with verbal prompts. {name} participated in community outing to the park. {name} took medications as scheduled with staff support.';
  const { presets, dropped } = presetsFromDescription(
    [
      { label: 'Morning hygiene', text: '{name} completed morning hygiene with verbal prompts.', category: 'Personal care' },
      { label: 'Medications', text: '{name} took medications as scheduled with staff support.', category: null },
      { label: 'Hydration', text: '{name} showed no signs of dehydration and vital signs were stable.', category: 'Health' }
    ],
    description,
    ORG
  );
  check('grounded phrases become presets', presets.length === 2);
  check('invented clinical content is dropped', dropped.length === 1 && dropped[0].preset.label === 'Hydration');
  check('every preset awaits approval', presets.every((p) => p.status === 'pending_approval'));
}

// ---------------------------------------------------------------------------
console.log('\nPath 3 — de-identification (SYNTHETIC note only)');

const noteFile = join(FIX, 'synthetic-note.txt');
const note = readFileSync(noteFile, 'utf8');
check('the only note fixture is labelled SYNTHETIC', note.startsWith('SYNTHETIC'));
{
  const text = deidentifyPhrasing(
    'Jordan Blake woke at 7:15 AM on 03/04/2026 and Dr. Quill called 304-555-0142 about ID A12345.',
    ['Jordan Blake', 'Jordan']
  );
  check('names, times, dates, phone and IDs are replaced', !/Jordan|Blake|Quill|7:15|03\/04|555|A12345/.test(text), text);
  check('nothing that looks like an identifier survives', residualIdentifiers(text).length === 0, residualIdentifiers(text).join(','));
}
check('an unknown capitalised name mid-sentence is caught', residualIdentifiers('Went for a walk with Morgan today.').includes('Morgan'));
{
  const gate = path3Gate({ orgId: ORG, acceptance: signed, platformAiBaaInPlace: true });
  const { presets, dropped } = presetsFromNotePhotos(
    [
      { label: 'Morning routine', text: 'Jordan completed morning routine with two verbal prompts.', category: null },
      { label: 'Walk', text: 'Walked to the store with Casey at 2 pm.', category: null }
    ],
    {
      orgId: ORG,
      gate,
      transcript: 'SYNTHETIC. Jordan completed morning routine with two verbal prompts. Walked to the store with staff at 2 pm.',
      namesSeen: ['Jordan']
    }
  );
  check('a clean pattern is kept with {name}', presets.length === 1 && presets[0].text.startsWith('{name} completed'), JSON.stringify(presets));
  check('a preset with an unrecognised name is dropped, and its text withheld', dropped.length === 1 && dropped[0].preset.text === '[withheld]');
}

setTimeout(() => {
  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (notRecorded.length) console.log(`  NOT MEASURED: WV model score (${notRecorded.join(', ')}) — no recorded model output`);
  console.log('');
  process.exit(failed ? 1 : 0);
}, 50);
