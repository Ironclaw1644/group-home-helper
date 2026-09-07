// Screenshot the landing page at the two sizes that matter: the phone the
// owner actually reviews on, and a desktop.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SHOOT_BASE || 'http://127.0.0.1:3000';
const OUT = 'landing-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

for (const [name, viewport, isMobile] of [
  ['phone', { width: 390, height: 844 }, true],
  ['desktop', { width: 1440, height: 900 }, false],
]) {
  const ctx = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: 2,
    // Freeze the walkthrough so the capture is deterministic rather than
    // catching whatever frame the carousel happened to be on.
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1200);

  await page.screenshot({ path: `${OUT}/${name}-fold.png` });
  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
  console.log(`${name}: fold + full captured`);
  await ctx.close();
}

await browser.close();
