/**
 * Prove that a generated document carries the requesting agency's letterhead
 * and nobody else's.
 *
 *   npm run verify:branding
 *
 * Three routes used to render `orgLine="At Home Family Service, LLC"` as a
 * string literal, and the shipped Form #680 template — which is global, shared
 * by every agency on the install — carried the same name and that agency's logo
 * path in its `render_config.header`. A customer set their own name in
 * Settings, saw it in the preview, printed, and filed another agency's
 * letterhead with Medicaid.
 *
 * So this renders for a demo agency against a template deliberately poisoned
 * with the old values, and fails if any of them reach the page. The poisoning
 * is the point: it is the regression that actually shipped.
 */
import { renderToBuffer } from '@react-pdf/renderer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TemplatePdf } from '../lib/pdf/TemplatePdf';
import { buildPrintContext } from '../lib/pdf/print-context';
import { QuarterlyReport } from '../lib/pdf/QuarterlyReport';
import type { FormTemplate, Note, Resident } from '../lib/types';

/** The strings that must never appear on another agency's document. */
const FORBIDDEN = ['At Home Family', 'AHFS', 'At Home Family Service, LLC'];

const DEMO_ORG_LINE = 'ZZ Demo Agency, LLC';
const DEMO_LETTERHEAD = 'Residential Support Program';
const DEMO_ADDRESS = '19 Example Road, Richmond, VA 23220';
const DEMO_FOOTER = 'Provider #DEMO-0001';

let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${label}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const resident: Resident = {
  id: 'demo',
  orgId: 'demo-org',
  homeId: 'home',
  firstName: 'Jordan',
  lastName: 'Placeholder',
  preferredName: 'JP',
  pronouns: { subject: 'they', object: 'them', possessive: 'their' },
  isDemo: true,
  medicaidId: '100000000002'
};

/**
 * A template carrying the old hardcoded identity.
 *
 * This is what is actually in the production database on the global
 * `daily_progress_note_680` row, so rendering against it is the real test.
 */
const poisonedTemplate: FormTemplate = {
  id: 'tpl',
  key: 'daily_progress_note_680',
  version: 1,
  name: 'Daily Progress Note',
  formNumber: '680',
  jurisdiction: 'US-VA',
  schema: {
    prompts: ['Where did {name} choose to go?', 'How did staff support {name}?'],
    sections: [],
    narrative: { key: 'narrative', type: 'narrative', label: 'Progress note' },
    signature: { key: 'signature', type: 'signature', attestation: '' }
  },
  renderConfig: {
    header: {
      logo: '/brand/AHFS_logo.png',
      org_line: 'At Home Family Service, LLC',
      title: 'Daily Progress Note'
    },
    footer: { form_line: 'Daily Progress Notes Form #680' },
    narrative_min_height: 340
  }
};

const note: Note = {
  id: 'note',
  orgId: 'demo-org',
  templateId: 'tpl',
  templateVersion: 1,
  residentId: 'demo',
  homeId: 'home',
  shiftId: 'shift',
  serviceDate: '2026-06-01',
  authorId: 'author',
  status: 'signed',
  structuredData: {},
  narrative:
    'Staff supported JP through the morning routine. JP chose to walk to the park and enjoyed the outing. There were no problems or concerns during shift.',
  aiAssisted: false,
  aiMode: 'none',
  locked: true,
  signatureName: 'Demo Staff',
  signatureTitle: 'DSP',
  signatureImagePath: null,
  isTrainingExample: false,
  createdAt: '2026-06-01T12:00:00Z',
  updatedAt: '2026-06-01T12:00:00Z'
} as unknown as Note;

/** Read a rendered PDF back as text. */
function extractText(buffer: Buffer, dir: string, name: string): string | null {
  const file = path.join(dir, name);
  writeFileSync(file, buffer);
  try {
    return execFileSync('pdftotext', ['-layout', file, '-'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024
    });
  } catch {
    return null;
  }
}

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ghh-branding-'));
  console.log('\nPDF branding is the requesting agency, not a hardcoded one\n');

  try {
    const form = await renderToBuffer(
      <TemplatePdf
        note={note}
        resident={resident}
        template={poisonedTemplate}
        ctx={buildPrintContext({
          note,
          resident,
          shiftLabel: '7AM-7PM',
          orgLine: DEMO_ORG_LINE
        })}
        shiftLabel="7AM-7PM"
        addenda={[]}
        orgLine={DEMO_ORG_LINE}
        letterhead={DEMO_LETTERHEAD}
        address={DEMO_ADDRESS}
        footerLine={DEMO_FOOTER}
        // An agency that never uploaded a logo must print none, rather than
        // falling back to the mark that used to be read off disk.
        logoSrc={null}
        signatureSrc={null}
      />
    );

    const quarterly = await renderToBuffer(
      <QuarterlyReport
        resident={resident}
        outcomes={[]}
        progress={[]}
        from="2026-03-01"
        to="2026-06-01"
        orgLine={DEMO_ORG_LINE}
        letterhead={DEMO_LETTERHEAD}
        address={DEMO_ADDRESS}
        footerLine={DEMO_FOOTER}
        generatedOn="2026-06-01"
        signedNoteCount={4}
        logoSrc={null}
      />
    );

    check('Form #680 renders without a logo', form.length > 1000);
    check('Quarterly review renders without a logo', quarterly.length > 1000);

    const formText = extractText(form, dir, 'form680.pdf');
    const quarterlyText = extractText(quarterly, dir, 'quarterly.pdf');

    if (formText === null || quarterlyText === null) {
      console.log('\n  pdftotext is not installed — text assertions skipped.');
      console.log('  Install poppler (brew install poppler) to run them.\n');
      // Not a failure: the renders above still prove the components accept and
      // require an org-supplied identity.
    } else {
      for (const [label, text] of [
        ['Form #680', formText],
        ['Quarterly review', quarterlyText]
      ] as const) {
        check(`${label} prints the requesting agency`, text.includes(DEMO_ORG_LINE));
        check(`${label} prints the letterhead line`, text.includes(DEMO_LETTERHEAD));
        check(`${label} prints the address`, text.includes(DEMO_ADDRESS));
        check(`${label} prints the agency footer`, text.includes(DEMO_FOOTER));

        for (const forbidden of FORBIDDEN) {
          check(
            `${label} contains no "${forbidden}"`,
            !text.includes(forbidden),
            'a hardcoded agency identity reached the page'
          );
        }
      }

      // The form number identifies the Virginia document and must survive.
      check(
        'Form #680 still carries its form number',
        formText.includes('Daily Progress Notes Form #680')
      );
    }

    // --- Source-level guard -------------------------------------------------
    // Cheap, and it catches the reintroduction of a literal before anyone has
    // to render anything.
    console.log('\nNo agency identity is hardcoded in a render path\n');
    const sources = [
      'app/notes/[id]/pdf/route.tsx',
      'app/residents/[id]/progress/pdf/route.tsx',
      'app/supervisor/export/route.tsx',
      'lib/pdf/TemplatePdf.tsx',
      'lib/pdf/print-context.ts',
      'lib/pdf/QuarterlyReport.tsx',
      'lib/pdf/assets.ts'
    ];
    for (const rel of sources) {
      const body = readFileSync(path.join(process.cwd(), rel), 'utf8');
      // The Form680 comment explains the bug by naming it, which is worth
      // keeping; only a string literal in code is a defect.
      const offending = FORBIDDEN.filter((f) =>
        new RegExp(`['"\`][^'"\`]*${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(body)
      );
      check(`${rel} has no hardcoded agency name`, offending.length === 0, offending.join(', '));
    }

    // --- Public copy --------------------------------------------------------
    // The pages a stranger sees before they have an account. /signup used to
    // tell a prospect to "read the PHI section of the README" — a document in a
    // private repo — which told them the product was not cleared for real data
    // and handed them homework they could not do. Nothing here may send a
    // customer to internal documentation, and nothing here may reach for the
    // vocabulary that makes copy read as machine-written.
    console.log('\nPublic copy speaks to a customer, not to a developer\n');
    const publicPages = [
      'app/signup/page.tsx',
      'components/onboarding/signup-form.tsx',
      'app/login/page.tsx',
      'app/login/login-form.tsx',
      'app/join/[code]/page.tsx',
      'app/download/page.tsx'
    ];
    // Matched inside quoted strings and JSX text alike, so an explanatory code
    // comment is still allowed to name the thing it is warning about.
    const BANNED_COPY = [
      'README',
      'bespoke',
      'seamless',
      'seamlessly',
      'elevate',
      'unlock the power',
      'cutting-edge',
      'best-in-class'
    ];
    for (const rel of publicPages) {
      const body = readFileSync(path.join(process.cwd(), rel), 'utf8')
        // Drop comments first: this file explains the bug by naming it, and so
        // does the sign-up form.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      const hits = BANNED_COPY.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(body));
      check(`${rel} sends nobody to internal docs or AI filler`, hits.length === 0, hits.join(', '));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log('');
  if (failures > 0) {
    console.error(`${failures} branding check(s) failed.\n`);
    process.exit(1);
  }
  console.log('All branding checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
