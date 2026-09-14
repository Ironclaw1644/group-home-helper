/**
 * SPIKE — run Path 1 on West Virginia's official blank form and score it.
 *
 *   npm run spike:import-wv            # PNG pages (the "photo" path)
 *   npm run spike:import-wv -- --pdf   # the rendered PDF
 *
 * Calls the Anthropic API (costs money). Touches no database: it reads only
 * ANTHROPIC_API_KEY from .env.local, not the Supabase variables, so nothing in
 * this process could reach Supabase even by accident.
 *
 * Fixture provenance: the .doc at docs/golden/wv-idd-07.json's source.url,
 * rendered locally through macOS Quick Look (qlmanage -p) to HTML, printed to
 * PDF with Playwright's Chromium, rasterised with pdftoppm at 120 dpi.
 *
 * Writes the model's raw output to scripts/fixtures/importer/ so verify:importer
 * can re-score it offline.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { extractForms, type Upload } from '../lib/importer/model';
import { buildDraftTemplates, type FormNumberRegistry } from '../lib/importer/template-draft';
import { scoreAgainstGolden, type GoldenSpec } from '../lib/importer/score';

const ROOT = join(__dirname, '..');
const FIX = join(ROOT, 'scripts/fixtures/importer');

// Only the one variable this needs. Deliberately not loadEnv(), which would
// also pull the Supabase credentials into this process.
if (!process.env.ANTHROPIC_API_KEY) {
  const line = readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .find((l) => l.startsWith('ANTHROPIC_API_KEY='));
  if (line) process.env.ANTHROPIC_API_KEY = line.slice('ANTHROPIC_API_KEY='.length).trim();
}

const usePdf = process.argv.includes('--pdf');
const uploads: Upload[] = usePdf
  ? [{ mediaType: 'application/pdf', base64: readFileSync(join(FIX, 'wv/wv-idd-07.pdf')).toString('base64') }]
  : [1, 2, 3].map((n) => ({ mediaType: 'image/png' as const, base64: readFileSync(join(FIX, `wv/page-${n}.png`)).toString('base64') }));

async function main() {
  const { raw, usage } = await extractForms(uploads);
  mkdirSync(FIX, { recursive: true });
  const out = join(FIX, `wv-raw-extraction.${usePdf ? 'pdf' : 'png'}.json`);
  writeFileSync(out, JSON.stringify({ _comment: 'Recorded model output. Regenerate with npm run spike:import-wv.', usage, raw }, null, 2) + '\n');

  const registry: FormNumberRegistry = JSON.parse(readFileSync(join(ROOT, 'docs/golden/form-number-registry.json'), 'utf8'));
  const golden: GoldenSpec = JSON.parse(readFileSync(join(ROOT, 'docs/golden/wv-idd-07.json'), 'utf8'));
  const drafts = buildDraftTemplates(raw, { orgId: 'spike-org', registry });
  const score = scoreAgainstGolden(drafts, golden);

  console.log(`\n  input: ${usePdf ? 'PDF' : '3 PNG pages'}   model: ${usage.model}`);
  console.log(`  tokens in/out: ${usage.inputTokens}/${usage.outputTokens}   ${usage.elapsedSeconds}s`);
  console.log(`  forms found: ${drafts.length} — ${drafts.map((d) => `${d.name}${d.import_review.is_log_or_table ? ' (log)' : ''}`).join(' | ')}`);
  console.log(`  matched draft: ${score.matchedDraftName}`);
  console.log(`  prompts verbatim: ${score.promptsMatched}/${score.promptsTotal}`);
  for (const m of score.promptMisses) console.log(`    MISS want: ${m.want}\n         got:  ${m.closest ?? '(nothing close)'}`);
  console.log(`  identity fields: ${score.identityFound.length}/${score.identityFound.length + score.identityMissing.length}  missing: ${score.identityMissing.join(', ') || 'none'}`);
  console.log(`  form_number null: ${score.formNumberNull}`);
  for (const d of drafts) {
    console.log(`\n  [${d.key}] active=${d.active} form_number=${d.form_number}`);
    console.log(`    prompts: ${JSON.stringify(d.schema.prompts)}`);
    console.log(`    sources: ${JSON.stringify(d.render_config)}`);
    console.log(`    rejected numbers: ${JSON.stringify(d.import_review.rejected_form_numbers)}`);
    console.log(`    unmapped labels: ${JSON.stringify(d.import_review.unmapped_labels)}`);
  }
  writeFileSync(out.replace('.json', '.drafts.json'), JSON.stringify({ score, drafts }, null, 2) + '\n');
  if (!existsSync(out)) process.exit(1);
}

main().catch((err) => {
  console.error('spike failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
