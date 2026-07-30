/**
 * Preview a brand scan from the command line.
 *
 *   npm run brand:scan -- athomefamilyservices.com
 *
 * Useful when onboarding a new agency: see what the extractor proposes before
 * wiring it into their organization record.
 */
import { scanBrand } from '../lib/branding/scan';
import { brandCssVariables, readableTextOn } from '../lib/branding/theme';

// 24-bit terminal swatch so the palette is judgeable at a glance.
function swatch(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `\x1b[48;2;${r};${g};${b}m      \x1b[0m`;
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: npm run brand:scan -- <website>');
    process.exit(1);
  }

  console.log(`\nScanning ${target}…\n`);
  const started = Date.now();
  const result = await scanBrand(target);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (!result.ok) {
    console.log(`Failed after ${elapsed}s`);
    for (const n of result.notes) console.log(`  ${n}`);
    process.exit(1);
  }

  console.log(`Source:  ${result.sourceUrl}   (${elapsed}s)\n`);
  console.log('Proposed theme:');
  const t = result.tokens;
  const rows: Array<[string, string]> = [
    ['navy  (headers, body text)', t.navy],
    ['teal  (primary actions)', t.teal],
    ['aqua  (accents, badges)', t.aqua],
    ['sand  (page background)', t.sand],
    ['slate (secondary text)', t.slate]
  ];
  for (const [label, hex] of rows) {
    console.log(`  ${swatch(hex)}  ${hex}  ${label}`);
  }

  console.log(`\n  text on navy: ${readableTextOn(t.navy)}`);
  console.log(`  font:         ${t.fontFamily ?? '(none detected)'}`);
  console.log(`  logo:         ${t.logoUrl ?? '(none detected)'}`);

  if (result.logoCandidates.length > 1) {
    console.log('\nOther logo candidates:');
    for (const c of result.logoCandidates.slice(1)) console.log(`  ${c}`);
  }

  if (result.palette.length) {
    console.log('\nFull palette by frequency:');
    const line = result.palette.slice(0, 16).map(swatch).join('');
    console.log(`  ${line}`);
    console.log(`  ${result.palette.slice(0, 8).join('  ')}`);
  }

  if (result.notes.length) {
    console.log('\nNotes:');
    for (const n of result.notes) console.log(`  - ${n}`);
  }

  console.log(`\nCSS emitted:\n  ${brandCssVariables(t)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
