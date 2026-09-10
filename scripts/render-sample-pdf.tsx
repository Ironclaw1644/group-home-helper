/**
 * Render a sample Form #680 to disk so the layout can be compared against the
 * scanned original (EE/detail.jpg) without standing up the database.
 *
 *   npm run pdf:sample
 *
 * The narrative below is the exemplar note from the scan, so a side-by-side
 * comparison exercises real line lengths and wrapping rather than lorem text.
 */
import { renderToFile } from '@react-pdf/renderer';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { TemplatePdf } from '../lib/pdf/TemplatePdf';
import { buildPrintContext } from '../lib/pdf/print-context';
import type { FormTemplate, Note, NoteAddendum, Resident } from '../lib/types';

const EXEMPLAR_NARRATIVE = [
  'This morning Alex was observed in bed, asleep appearing to be resting comfortably.',
  'There were no signs of stress and discomfort while he appeared to be resting. Staff',
  'awakened Alex and greeted him; in return he greeted staff. Staff prompted Alex to the',
  'restroom where he independently completed his ADLs. Alex was supported by staff in',
  'preparing his breakfast, which he enjoyed preparing. Alex ate 100% of his meal with no',
  'problem. Alex was supported in doing light housekeeping with support by staff assuring',
  'his home was maintained well. Alex was transported to the museum where he enjoyed',
  'looking at different art exhibits. A well-balanced lunch was provided and consumed at the',
  'museum. Alex returned home and enjoyed relaxing listening to music. Alex engaged in',
  'conversation with staff. A nutritious dinner was served and enjoyed. There were no',
  'problems or concerns during shift.'
].join(' ');

const resident: Resident = {
  id: 'demo',
  orgId: 'org',
  homeId: 'home',
  firstName: 'Alex',
  lastName: 'Sample',
  pronouns: { subject: 'he', object: 'him', possessive: 'his' },
  isDemo: true,
  medicaidId: '100000000000'
};

const template: FormTemplate = {
  id: 'tpl',
  key: 'daily_progress_note_680',
  version: 1,
  name: 'Daily Progress Note',
  formNumber: '680',
  jurisdiction: 'US-VA',
  schema: {
    prompts: [
      'Where did {name} choose to go?',
      'What did {name} do while there?',
      'How did {name} choose the activity?',
      'Did {subject} enjoy the activity?',
      'How did staff support {name}?'
    ],
    sections: [],
    narrative: { key: 'narrative', type: 'narrative', label: 'Progress note' },
    signature: { key: 'signature', type: 'signature', attestation: '' }
  },
  renderConfig: {
    header: { org_line: 'At Home Family Service, LLC', title: 'Daily Progress Note' },
    footer: { form_line: 'Daily Progress Notes Form #680' },
    narrative_min_height: 340
  }
};

const note: Note = {
  id: 'note',
  prestagedAt: null,
  prestageConfirmedAt: null,
  orgId: 'org',
  templateId: 'tpl',
  templateVersion: 1,
  residentId: 'demo',
  homeId: 'home',
  shiftId: 'shift',
  serviceDate: '2026-06-01',
  authorId: 'author',
  status: 'signed',
  structuredData: {},
  narrative: EXEMPLAR_NARRATIVE,
  aiAssisted: true,
  aiMode: 'example',
  isTrainingExample: true,
  signedAt: '2026-06-01T19:05:00.000Z',
  signatureName: 'Sam Vetep',
  signatureTitle: 'DSP',
  signatureImagePath: null,
  attestationText: null,
  locked: true,
  similarityPrev: null,
  updatedAt: '2026-06-01T19:05:00.000Z'
};

const addenda: NoteAddendum[] = [];

async function main() {
  let logoSrc: string | null = null;
  try {
    const bytes = await readFile(path.join(process.cwd(), 'public', 'brand', 'AHFS_logo.png'));
    logoSrc = `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    console.warn('logo not found — rendering without it');
  }

  const out = path.join(process.cwd(), 'tmp', 'sample-note.pdf');
  await renderToFile(
    <TemplatePdf
      note={note}
      resident={resident}
      template={template}
      ctx={buildPrintContext({
        note,
        resident,
        shiftLabel: '7AM-7PM',
        orgLine: 'At Home Family Service, LLC'
      })}
      shiftLabel="7AM-7PM"
      addenda={addenda}
      orgLine="At Home Family Service, LLC"
      logoSrc={logoSrc}
      signatureSrc={null}
    />,
    out
  );

  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
