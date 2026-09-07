/**
 * Record one demo flow by driving the real product.
 *
 *   npm run video:capture -- branding
 *   npm run video:capture -- roster
 *   npm run video:capture -- oversight
 *
 * The flows themselves live in scripts/flows.ts. This file is only the rig:
 * a phone-sized browser, a demo sandbox, a visible tap, and a beat log.
 *
 * scripts/capture-demo-video.ts remains the note flow. It is longer and
 * fussier than any of these because signing has real preconditions, and
 * folding it in here would have meant a worse version of both.
 */

import { chromium, type Page } from 'playwright';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { FLOWS, type Ctx } from './flows';

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:3000';
const PHONE = { width: 390, height: 844 };

const flowKey = process.argv[2];
const flow = FLOWS[flowKey];
if (!flow) {
  console.error(`unknown flow ${flowKey ?? '(none)'} — try: ${Object.keys(FLOWS).join(', ')}`);
  process.exit(1);
}

const OUT = path.join(process.cwd(), 'tmp', 'demo-video', flow.key);

type Beat = { name: string; at: number };
const beats: Beat[] = [];
let t0 = 0;

const TAP_INDICATOR = `
(() => {
  if (window.__tapInit) return;
  window.__tapInit = true;
  const style = document.createElement('style');
  style.textContent = \`
    .__tap { position: fixed; z-index: 2147483647; pointer-events: none;
      width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
      background: rgba(20,69,47,.28); border: 2px solid rgba(20,69,47,.55);
      animation: __tapPop .55s ease-out forwards; }
    @keyframes __tapPop { 0% { transform: scale(.35); opacity: .95; }
      100% { transform: scale(1.5); opacity: 0; } }\`;
  document.documentElement.appendChild(style);
  window.__tap = (x, y) => {
    const d = document.createElement('div');
    d.className = '__tap';
    d.style.left = x + 'px';
    d.style.top = y + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 600);
  };
})();
`;

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    acceptDownloads: true,
    // Must equal the viewport; a larger canvas pads rather than scales.
    recordVideo: { dir: OUT, size: PHONE }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(90_000);

  const inject = async () => {
    await page
      .addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
      .catch(() => {});
    await page.evaluate(TAP_INDICATOR).catch(() => {});
  };
  page.on('load', () => void inject());

  const mark = (name: string) => {
    const at = (Date.now() - t0) / 1000;
    beats.push({ name, at });
    console.log(`  ${at.toFixed(1).padStart(6)}s  ${name}`);
  };

  const tap = async (locator: ReturnType<Page['locator']>) => {
    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(180);
    const box = await locator.boundingBox();
    if (box) {
      await page.evaluate(
        ([px, py]) => (window as any).__tap?.(px, py),
        [box.x + box.width / 2, box.y + box.height / 2]
      );
      await page.waitForTimeout(120);
    }
    await locator.click();
    await page.waitForTimeout(260);
  };

  /** Type visibly, so the viewer sees a person filling a field. */
  const type = async (locator: ReturnType<Page['locator']>, text: string) => {
    await locator.click();
    for (const ch of text) {
      await locator.type(ch, { delay: 28 });
    }
  };

  // The clock has to start when the RECORDING starts, which is when the
  // context was created — not when the flow starts.
  //
  // Resetting it after provisioning produced beats measured from a different
  // zero than the footage, so every caption fired however many seconds early
  // the sandbox had taken to build. The branding film captioned "the preview
  // is the document" over the marketing homepage, and it looked like a
  // rendering fault rather than a clock fault.
  t0 = Date.now();

  console.log(`· ${flow.key}: opening a demo sandbox`);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await inject();
  await page.getByRole('button', { name: /try it yourself/i }).first().click();
  await page.waitForURL((u) => !/\/(login|signup)/.test(u.pathname), { timeout: 120_000 });
  await page.getByRole('link', { name: /start .* note/i }).waitFor({ timeout: 120_000 });
  await inject();
  await page.waitForTimeout(800);

  // The sandbox is provisioned. This beat is where the film should begin —
  // the build script trims everything before it, so a slow provision costs
  // dead footage rather than desynchronised captions.
  mark('open');

  const ctx: Ctx = { page, tap, mark, inject, type };
  await flow.run(ctx);

  mark('end');
  await page.waitForTimeout(900);

  await context.close();
  await browser.close();

  await writeFile(path.join(OUT, 'beats.json'), JSON.stringify(beats, null, 2));
  await writeFile(
    path.join(OUT, 'flow.json'),
    JSON.stringify(
      { key: flow.key, title: flow.title, subtitle: flow.subtitle, captions: flow.captions },
      null,
      2
    )
  );
  console.log(`\n${flow.key} footage in ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
