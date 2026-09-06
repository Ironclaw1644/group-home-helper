/**
 * Records-integrity checks: nothing may claim a human said something they did
 * not say.
 *
 *   npm run verify:records
 *
 * The bug this exists for: `note_outcomes.addressed` was a plain boolean that
 * initialised to `false`, and the editor rendered `false` as a *selected* "Not
 * this shift" chip. A brand-new note therefore opened already asserting that
 * none of the resident's ISP outcomes had been worked on, autosaved that
 * assertion to the database within about a second, and printed it on Form #680
 * as "Not addressed this shift" — a clinical claim in a Medicaid record that no
 * DSP had made.
 *
 * So the properties below are all one property, checked at every layer that
 * could reintroduce it: an outcome nobody answered must not read as a negative
 * in state, in the payload, in the database write, or on the printed form.
 */
import { renderToBuffer } from '@react-pdf/renderer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Form680 } from '../lib/pdf/Form680';
import { answeredOutcomes, outcomeStatus, unansweredOutcomes } from '../lib/outcomes/answered';
import type {
  FormTemplate,
  Note,
  NoteOutcome,
  Outcome,
  Resident
} from '../lib/types';

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function section(title: string) {
  console.log(`\n${title}\n`);
}

const WORKED_ON: Outcome = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Prepare a simple meal with support'
} as Outcome;

const UNANSWERED: Outcome = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Take a walk in the neighbourhood'
} as Outcome;

const RULED_OUT: Outcome = {
  id: '33333333-3333-4333-8333-333333333333',
  title: 'Practise using the bus timetable'
} as Outcome;

/** What the editor holds for a note where only one outcome has been touched. */
const partiallyCompleted: NoteOutcome[] = [
  {
    outcomeId: WORKED_ON.id,
    addressed: true,
    supportLevel: 'verbal_prompt',
    progress: 'progressed',
    comment: null
  },
  { outcomeId: UNANSWERED.id, addressed: null, supportLevel: null, progress: null, comment: null },
  { outcomeId: RULED_OUT.id, addressed: false, supportLevel: null, progress: null, comment: null }
];

// ---------------------------------------------------------------------------
section('An unanswered outcome is a third state, not a "no"');
// ---------------------------------------------------------------------------
{
  check('an answered-yes outcome classifies as addressed', outcomeStatus(partiallyCompleted[0]) === 'addressed');
  check(
    'an explicit "not this shift" classifies as not_addressed',
    outcomeStatus(partiallyCompleted[2]) === 'not_addressed'
  );
  check('a null answer classifies as unanswered', outcomeStatus(partiallyCompleted[1]) === 'unanswered');
  check(
    'a missing entry classifies as unanswered, not as a negative',
    outcomeStatus(undefined) === 'unanswered'
  );
}

// ---------------------------------------------------------------------------
section('An unanswered outcome is never written to the database');
// ---------------------------------------------------------------------------
{
  const toWrite = answeredOutcomes(partiallyCompleted);

  check('the two answered outcomes are saved', toWrite.length === 2);
  check(
    'the unanswered outcome is dropped from the write',
    !toWrite.some((e) => e.outcomeId === UNANSWERED.id),
    'it would be stored as addressed=false by the not-null column'
  );
  check(
    'a deliberate "not this shift" is still saved — it is a recorded fact',
    toWrite.some((e) => e.outcomeId === RULED_OUT.id && e.addressed === false)
  );

  // The state a fresh note opens in: every outcome present, none answered.
  const fresh: NoteOutcome[] = [WORKED_ON, UNANSWERED, RULED_OUT].map((o) => ({
    outcomeId: o.id,
    addressed: null,
    supportLevel: null,
    progress: null,
    comment: null
  }));

  check(
    'a brand-new note writes no outcome rows at all',
    answeredOutcomes(fresh).length === 0,
    'an untouched note must not assert anything about the service plan'
  );
}

// ---------------------------------------------------------------------------
section('Signing is blocked while any outcome is unanswered');
// ---------------------------------------------------------------------------
{
  const plan = [WORKED_ON, UNANSWERED, RULED_OUT];

  const outstanding = unansweredOutcomes(plan, partiallyCompleted);
  check('the one unanswered outcome is reported', outstanding.length === 1);
  check('and it is named so the DSP can find it', outstanding[0]?.title === UNANSWERED.title);

  const allAnswered = partiallyCompleted.map((e) =>
    e.addressed === null ? { ...e, addressed: false } : e
  );
  check('once every outcome is answered, nothing is outstanding', unansweredOutcomes(plan, allAnswered).length === 0);

  check(
    'an outcome with no entry at all still blocks signing',
    unansweredOutcomes(plan, []).length === 3
  );
}

// ---------------------------------------------------------------------------
// The printed form. This is the copy that gets filed with Medicaid, so it is
// the one that matters most.
// ---------------------------------------------------------------------------
const resident: Resident = {
  id: 'r1',
  orgId: 'org',
  homeId: 'home',
  firstName: 'Jordan',
  lastName: 'Placeholder',
  preferredName: 'JP',
  pronouns: { subject: 'they', object: 'them', possessive: 'their' },
  isDemo: true,
  medicaidId: null
} as unknown as Resident;

const template: FormTemplate = {
  id: 'tpl',
  key: 'daily_progress_note_680',
  version: 1,
  name: 'Daily Progress Note',
  formNumber: '680',
  schema: {
    prompts: [],
    sections: [],
    narrative: { key: 'narrative', type: 'narrative', label: 'Progress note' },
    signature: { key: 'signature', type: 'signature', attestation: '' }
  },
  renderConfig: {
    header: { title: 'Daily Progress Note' },
    footer: { form_line: 'Daily Progress Notes Form #680' },
    narrative_min_height: 340
  }
} as unknown as FormTemplate;

const note: Note = {
  id: 'n1',
  orgId: 'org',
  templateId: 'tpl',
  templateVersion: 1,
  residentId: 'r1',
  homeId: 'home',
  shiftId: 'shift',
  serviceDate: '2026-09-01',
  authorId: 'author',
  status: 'draft',
  structuredData: {},
  narrative: 'Staff supported JP through the morning routine.',
  aiAssisted: false,
  aiMode: 'none',
  locked: false,
  signatureName: 'Demo Staff',
  signatureTitle: 'DSP',
  signatureImagePath: null,
  isTrainingExample: false,
  createdAt: '2026-09-01T12:00:00Z',
  updatedAt: '2026-09-01T12:00:00Z'
} as unknown as Note;

async function main() {
  section('A partially-completed note does not print an unanswered outcome as answered');

  const dir = mkdtempSync(path.join(tmpdir(), 'ghh-records-'));
  try {
    // Rendered the way the route does it: the answered rows only, because that
    // is all the database has. The unanswered outcome is on the plan and has no
    // row — exactly the case that used to print as "Not addressed this shift".
    const buffer = await renderToBuffer(
      <Form680
        note={note}
        resident={resident}
        template={template}
        shiftLabel="7AM-7PM"
        addenda={[]}
        orgLine="ZZ Demo Agency, LLC"
        logoSrc={null}
        signatureSrc={null}
        outcomes={[WORKED_ON, UNANSWERED, RULED_OUT]}
        noteOutcomes={answeredOutcomes(partiallyCompleted)}
        activities={[]}
        noteActivities={[]}
      />
    );

    check('the form renders', buffer.length > 1000);

    const file = path.join(dir, 'form680.pdf');
    writeFileSync(file, buffer);

    let text: string | null = null;
    try {
      text = execFileSync('pdftotext', ['-layout', file, '-'], {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024
      });
    } catch {
      text = null;
    }

    if (text === null) {
      console.log('\n  pdftotext is not installed — text assertions skipped.');
      console.log('  Install poppler (brew install poppler) to run them.\n');
    } else {
      // Normalise the line wrapping the PDF layout introduces.
      const flat = text.replace(/\s+/g, ' ');

      check(
        'the outcome that was worked on prints as addressed',
        flat.includes(`${WORKED_ON.title} — Addressed this shift`),
        flat
      );
      check(
        'the outcome the DSP ruled out prints as not addressed',
        flat.includes(`${RULED_OUT.title} — Not addressed this shift`),
        flat
      );
      check(
        'the unanswered outcome prints as not recorded, not as a negative',
        flat.includes(`${UNANSWERED.title} — Not recorded`),
        flat
      );
      check(
        'the unanswered outcome is NOT printed as "Not addressed this shift"',
        !flat.includes(`${UNANSWERED.title} — Not addressed this shift`),
        'an unmade clinical claim reached a Medicaid document'
      );
      check(
        'the unanswered outcome is still shown rather than silently omitted',
        flat.includes(UNANSWERED.title),
        'a reviewer needs to see the gap'
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log('');
  if (failures > 0) {
    console.error(`${failures} records check(s) FAILED.\n`);
    process.exit(1);
  }
  console.log('All records-integrity checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
