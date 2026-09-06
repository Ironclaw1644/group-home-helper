/**
 * Scratch: does TemplatePdf with default config equal the shipped Form680?
 * Reports the first difference. Not wired into package.json.
 */
import { renderToBuffer } from '@react-pdf/renderer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ShippedForm680 } from './reference/Form680.shipped';
import { TemplatePdf } from '../lib/pdf/TemplatePdf';
import { buildPrintContext } from '../lib/pdf/print-context';
import * as f from './reference/fixture';

function text(buf: Buffer, dir: string, name: string): string {
  const file = path.join(dir, name);
  writeFileSync(file, buf);
  return execFileSync('pdftotext', ['-layout', file, '-'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
}

/** Strip the bits of a PDF that change on every render. */
function normalize(buf: Buffer): string {
  return buf
    .toString('latin1')
    .replace(/\/CreationDate\s*\([^)]*\)/g, '/CreationDate()')
    .replace(/\/ModDate\s*\([^)]*\)/g, '/ModDate()')
    .replace(/\/ID\s*\[[^\]]*\]/g, '/ID[]');
}

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ghh-cmp-'));
  const shared = {
    note: f.note,
    resident: f.resident,
    template: f.virginiaTemplate,
    shiftLabel: f.SHIFT_LABEL,
    addenda: f.addenda,
    orgLine: f.ORG_LINE,
    letterhead: f.LETTERHEAD,
    address: f.ADDRESS,
    footerLine: f.FOOTER_LINE,
    logoSrc: null,
    signatureSrc: null,
    outcomes: f.outcomes,
    noteOutcomes: f.noteOutcomes,
    activities: f.activities,
    noteActivities: f.noteActivities
  };

  const before = await renderToBuffer(<ShippedForm680 {...shared} />);
  const after = await renderToBuffer(
    <TemplatePdf
      {...shared}
      ctx={buildPrintContext({
        note: f.note,
        resident: f.resident,
        shiftLabel: f.SHIFT_LABEL,
        orgLine: f.ORG_LINE
      })}
    />
  );

  writeFileSync('/tmp/before.pdf', before);
  writeFileSync('/tmp/after.pdf', after);

  const tb = text(before, dir, 'before.pdf');
  const ta = text(after, dir, 'after.pdf');

  console.log('text identical :', tb === ta);
  if (tb !== ta) {
    const lb = tb.split('\n');
    const la = ta.split('\n');
    for (let i = 0; i < Math.max(lb.length, la.length); i++) {
      if (lb[i] !== la[i]) {
        console.log(`  first diff at line ${i + 1}`);
        console.log(`  before: ${JSON.stringify(lb[i])}`);
        console.log(`  after : ${JSON.stringify(la[i])}`);
        break;
      }
    }
  }

  const nb = normalize(before);
  const na = normalize(after);
  console.log('bytes identical:', nb === na, `(${before.length} vs ${after.length})`);
  if (nb !== na) {
    for (let i = 0; i < Math.max(nb.length, na.length); i++) {
      if (nb[i] !== na[i]) {
        console.log(`  first byte diff at ${i}`);
        console.log(`  before: ${JSON.stringify(nb.slice(Math.max(0, i - 60), i + 60))}`);
        console.log(`  after : ${JSON.stringify(na.slice(Math.max(0, i - 60), i + 60))}`);
        break;
      }
    }
  }

  rmSync(dir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
