/**
 * Render a sample note to disk so the layout can be checked without standing up
 * the database.
 *
 *   npm run pdf:sample
 *
 * It renders WEST VIRGINIA's Direct Support Progress Note, because that is the
 * one state form this product reproduces and therefore the only sample whose
 * every line can be checked against a published document.
 *
 * This script used to render "Daily Progress Notes Form #680" on At Home Family
 * Service letterhead. The 7af6d2b purge took that caption out of the app but not
 * out of here — `scripts/` was never in verify:wv-form's list of surfaces — so
 * the one command anybody would run to make a sample for a prospect was still
 * the last place in the tree printing the fabricated number. A sample PDF is a
 * customer surface. It is treated as one now, and verify:wv-form watches this
 * directory.
 *
 * Nothing about the form is typed in below. The prompts and the render config
 * are read out of `0041_west_virginia_real_form.sql`, the same migration the
 * database is built from, so this sample cannot drift away from what a paying
 * agency's notes actually print. Only the fake resident, the narrative and the
 * letterhead are local to this file.
 */
import { renderToFile } from '@react-pdf/renderer';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import { TemplatePdf } from '../lib/pdf/TemplatePdf';
import { buildPrintContext } from '../lib/pdf/print-context';
import type { FormTemplate, Note, NoteAddendum, Resident } from '../lib/types';

const ROOT = path.join(__dirname, '..');
const MIGRATION = path.join(
  ROOT,
  'supabase/migrations/0041_west_virginia_real_form.sql'
);
const GOLDEN = path.join(ROOT, 'docs/golden/wv-idd-07.json');

/** Pull a $tag$...$tag$ dollar-quoted block out of the migration. */
function dollarBlock(sql: string, tag: string): string {
  const open = `$${tag}$`;
  const start = sql.indexOf(open);
  if (start === -1) throw new Error(`migration is missing the $${tag}$ block`);
  const from = start + open.length;
  const end = sql.indexOf(open, from);
  if (end === -1) throw new Error(`$${tag}$ block is not closed`);
  return sql.slice(from, end);
}

const sql = readFileSync(MIGRATION, 'utf8');
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
const prompts: string[] = JSON.parse(dollarBlock(sql, 'prompts'));
const renderConfig = JSON.parse(dollarBlock(sql, 'render'));

/**
 * The narrative is an exception-shaped shift, on purpose.
 *
 * West Virginia's Progress Note is exception-based — its subtitle limits it to
 * shifts where something out of the ordinary occurred — so a sample showing a
 * quiet, uneventful day would be a sample of the wrong document. This one has a
 * refusal, a change in mood and a support adjustment in it, and answers the
 * state's four questions in the order the form asks them.
 */
const EXEMPLAR_NARRATIVE = [
  'Alex worked on his goal of preparing a meal with decreasing prompts. He completed the',
  'first two steps independently, which is further than he has managed before, but declined',
  'to continue at the stove and walked away from the kitchen. Staff did not press him.',
  'Later in the afternoon Alex was quieter than usual and spent about an hour in his room',
  'with the door open; he declined a walk he had chosen earlier in the week. He did not',
  'report pain and had no visible signs of illness, and he ate a full dinner. Alex needed',
  'more support than he typically does for the evening routine — verbal prompts through',
  'each step rather than the single reminder he usually needs. He accepted that support',
  'without objection and settled well at the end of shift. On-call supervisor was notified',
  'of the change in mood at 6:40 PM per agency policy. No incident report was required.'
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

const ORG_LINE = 'At Home Family Service, LLC';

const template: FormTemplate = {
  id: 'tpl',
  key: golden.template_key,
  version: 2,
  name: golden.title,
  // Null, and it stays null. The document numbers nothing on its face; see
  // docs/golden/wv-idd-07.json for why "IDD_07" is a filename, not a number.
  formNumber: null,
  jurisdiction: golden.jurisdiction,
  schema: {
    prompts,
    sections: [],
    narrative: { key: 'narrative', type: 'narrative', label: 'Progress note' },
    signature: {
      key: 'signature',
      type: 'signature',
      attestation:
        'I attest that the services described above were provided as documented and that this note is a true and accurate record of this shift.'
    }
  },
  renderConfig: {
    ...renderConfig,
    header: { ...renderConfig.header, org_line: ORG_LINE }
  }
};

const note: Note = {
  id: 'note',
  prestagedAt: null,
  prestageConfirmedAt: null,
  orgId: 'org',
  templateId: 'tpl',
  templateVersion: 2,
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
    const bytes = await readFileAsync(
      path.join(process.cwd(), 'public', 'brand', 'AHFS_logo.png')
    );
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
      // `shift` fills the state's "Time:" field. providerId is deliberately
      // not passed: that is the agency's own WV Medicaid provider number, and
      // a sample is the last place to invent one. It prints blank, which is
      // what it should look like before an agency enters theirs in settings.
      ctx={buildPrintContext({
        note,
        resident,
        shift: { label: '7AM-7PM', startTime: '07:00:00', endTime: '19:00:00' },
        shiftLabel: '7AM-7PM',
        orgLine: ORG_LINE
      })}
      shiftLabel="7AM-7PM"
      addenda={addenda}
      orgLine={ORG_LINE}
      logoSrc={logoSrc}
      signatureSrc={null}
    />,
    out
  );

  console.log(`Wrote ${out}`);
  console.log(`  ${golden.title} — ${golden.jurisdiction}`);
  console.log(`  footer: ${renderConfig.footer.form_line}`);
  console.log(`  source: ${golden.source.url}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
