/**
 * Phone walkthrough of the one-click form import and the note it produces.
 *
 *   QA_BASE=https://<preview> QA_BYPASS=<secret> npm run qa:claude-launch
 *   QA_BASE=http://localhost:3000 npm run qa:claude-launch
 *
 * Runs as the Riverbend demo sandbox — a fictional agency with fictional
 * residents that expires on its own — so no real person is involved. Uploads
 * West Virginia's official BLANK form (scripts/fixtures/importer/wv), confirms
 * it, then writes, drafts and signs a note on it. Screenshots and the signed
 * PDF go to qa-shots/claude-launch/.
 *
 * Calls the live model twice (one import, one draft) through the deployment.
 * QA_BYPASS is a Vercel protection-bypass secret; it is sent as a header and
 * never printed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices, type Page } from 'playwright';

const BASE = (process.env.QA_BASE || 'http://localhost:3000').replace(/\/$/, '');
const OUT = join(__dirname, '..', 'qa-shots', 'claude-launch');
const FIX = join(__dirname, 'fixtures', 'importer', 'wv');

mkdirSync(OUT, { recursive: true });

const timings: Record<string, number> = {};
let shot = 0;
async function snap(page: Page, name: string, fullPage = false) {
  shot++;
  const file = join(OUT, `${String(shot).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage });
  console.log(`  shot ${file.replace(`${OUT}/`, '')}`);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    extraHTTPHeaders: process.env.QA_BYPASS
      ? { 'x-vercel-protection-bypass': process.env.QA_BYPASS, 'x-vercel-set-bypass-cookie': 'true' }
      : {}
  });
  const page = await context.newPage();
  page.on('load', () => void page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {}));

  console.log(`· demo sandbox on ${BASE}`);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /try it yourself/i }).first().click();
  await page.waitForURL((u) => !/\/(login|signup)/.test(u.pathname), { timeout: 90_000 });
  await page.getByRole('link', { name: /start .* note/i }).first().waitFor({ timeout: 90_000 });
  await snap(page, 'today-before');

  console.log('· your form');
  await page.goto(`${BASE}/forms?onboarding=1`, { waitUntil: 'networkidle' });
  await snap(page, 'form-start');

  await page
    .getByTestId('file-input')
    .setInputFiles([1, 2, 3].map((n) => join(FIX, `page-${n}.png`)));
  await page.getByRole('img', { name: 'Page 3' }).waitFor({ timeout: 20_000 });
  await snap(page, 'form-pages-added');

  let started = Date.now();
  await page.getByRole('button', { name: /read my form/i }).click();
  await page.getByTestId('import-reading').waitFor();
  await page.waitForTimeout(4000);
  await snap(page, 'form-reading');
  await page.getByTestId('paper-preview').waitFor({ timeout: 150_000 });
  timings.importSeconds = (Date.now() - started) / 1000;
  await page.waitForTimeout(300);
  await snap(page, 'form-preview-filled');
  await snap(page, 'form-preview-full', true);

  await page.getByRole('button', { name: /something wrong\? fix it/i }).click();
  await page.getByText('Questions staff answer').scrollIntoViewIfNeeded();
  await snap(page, 'form-fix-it');
  await page.getByRole('button', { name: /done fixing/i }).click();

  await page.getByRole('button', { name: /looks right — use this form/i }).click();
  await page.getByTestId('import-done').waitFor({ timeout: 30_000 });
  await snap(page, 'form-confirmed');

  console.log('· write a note on it');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await snap(page, 'today-after');
  await page.getByRole('link', { name: /start .* note/i }).first().click();
  await page.waitForURL(/\/notes\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const noteId = /\/notes\/([0-9a-f-]{36})/.exec(page.url())![1];
  await page.waitForLoadState('networkidle');
  await page.locator('details summary').first().click();
  await snap(page, 'note-open');

  // Service plan: record each outcome as not worked on this shift, which is a
  // real answer and keeps the walkthrough short.
  for (const b of await page.getByRole('button', { name: 'Not this shift' }).all()) await b.click();
  // What happened: the first option in the first three groups.
  const groups = await page.locator('[role="group"]').all();
  for (const g of groups.slice(0, 3)) await g.locator('button').first().click();
  await page.waitForTimeout(400);
  await snap(page, 'note-entries');

  started = Date.now();
  await page.getByRole('button', { name: 'Write my note' }).last().click();
  await page.waitForFunction(
    () => ((document.querySelector('textarea.field-input') as HTMLTextAreaElement | null)?.value ?? '').length > 40,
    null,
    { timeout: 60_000 }
  );
  timings.draftSeconds = (Date.now() - started) / 1000;
  await page.waitForTimeout(800);
  await snap(page, 'note-drafted');

  await page.getByRole('button', { name: /review and sign/i }).click();
  await page.getByRole('button', { name: /^type$/i }).click();
  await page.getByPlaceholder(/type your full name/i).fill('');
  await page.getByPlaceholder(/type your full name/i).pressSequentially('Robin Vance', { delay: 30 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  await page.getByRole('checkbox').last().check();
  await page.waitForTimeout(300);
  await snap(page, 'note-ready-to-sign');

  await page.getByRole('button', { name: /sign and lock note/i }).last().click();
  await page.getByText(/signed and locked/i).first().waitFor({ timeout: 30_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await snap(page, 'note-signed-next');

  const pdf = await page.request.get(`${BASE}/notes/${noteId}/pdf`);
  writeFileSync(join(OUT, 'signed-note-on-imported-form.pdf'), await pdf.body());
  console.log(`  pdf ${pdf.status()} signed-note-on-imported-form.pdf`);

  writeFileSync(join(OUT, 'timings.json'), JSON.stringify({ base: BASE.replace(/\/\/.*@/, '//'), ...timings }, null, 2));
  console.log(`\n  import ${timings.importSeconds}s, draft ${timings.draftSeconds}s`);
  await browser.close();
}

main().catch((err) => {
  console.error('walkthrough failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
