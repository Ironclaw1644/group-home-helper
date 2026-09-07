/**
 * Screenshots for review, of the landing page and the signed-in app.
 *
 *   npm run dev            # in another terminal
 *   npm run shots:review
 *
 * Written to review-shots/, which is gitignored — these are for looking at and
 * sending to someone, not for shipping. The walkthrough frames the page
 * actually serves are a different thing and live in public/walkthrough/.
 *
 * Two viewports, because the two audiences are different: 390x844 is the
 * administrator reading this on their phone, and 1440x900 is the same person
 * at a desk. Both a first-screen crop and the whole page, because the question
 * "can they answer what this is, what it does and what it costs before
 * scrolling" is only answerable from the crop.
 *
 * The app is shot too, signed in through the demo, because the point of the
 * brand work is that the page and the product look like the same company.
 */
import { chromium, type Browser } from 'playwright';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:3000';
const OUT = path.join(process.cwd(), 'review-shots');

const VIEWPORTS = [
  { name: 'phone-390x844', width: 390, height: 844, mobile: true },
  { name: 'desktop-1440x900', width: 1440, height: 900, mobile: false }
];

async function landing(browser: Browser, vp: (typeof VIEWPORTS)[number]) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.mobile,
    hasTouch: vp.mobile
  });
  const page = await context.newPage();
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  page.on('load', () => {
    void page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /try it yourself/i }).first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);

  // The first screen: what an administrator sees before they scroll at all.
  await page.screenshot({ path: path.join(OUT, `landing-${vp.name}-first-screen.png`) });

  // Walk the page before the full-page capture. Sections fade in on an
  // IntersectionObserver, and a fullPage screenshot does not trip it for
  // everything below the fold — so an uncrawled capture comes back with
  // several screens of blank paper and looks like a broken page rather than
  // an unscrolled one.
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);

  await page.screenshot({ path: path.join(OUT, `landing-${vp.name}-full.png`), fullPage: true });

  await context.close();
}

async function app(browser: Browser, vp: (typeof VIEWPORTS)[number]) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.mobile,
    hasTouch: vp.mobile
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  page.on('load', () => {
    void page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /try it yourself/i }).first().click();
  await page.getByRole('link', { name: /start .* note/i }).waitFor({ timeout: 120_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);

  await page.screenshot({ path: path.join(OUT, `app-${vp.name}-home.png`) });

  // One note screen as well — it is where a DSP spends the whole shift, and
  // where a palette that only half-applied would show.
  await page.getByRole('link', { name: /start .* note/i }).first().click();
  await page.waitForURL(/\/notes\//);
  await page.getByRole('button', { name: /write from my entries/i }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);

  await page.screenshot({ path: path.join(OUT, `app-${vp.name}-note.png`) });

  await context.close();
}

/**
 * The walkthrough as someone who has asked their phone to stop moving things
 * sees it: no carousel, the five frames as a captioned strip.
 */
async function reducedMotion(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /try it yourself/i }).first().waitFor();
  await page.evaluate(() => document.fonts.ready);

  const strip = page.locator('.fb-walk-static');
  await strip.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);

  await strip.screenshot({ path: path.join(OUT, 'walkthrough-reduced-motion-fallback.png') });

  await context.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    console.log(`· landing ${vp.name}`);
    await landing(browser, vp);
    console.log(`· app ${vp.name}`);
    await app(browser, vp);
  }

  console.log('· walkthrough, reduced motion');
  await reducedMotion(browser);

  await browser.close();

  const files = (await readdir(OUT)).filter((f) => f.endsWith('.png')).sort();
  console.log(`\n${files.length} screenshots in ${OUT}:`);
  for (const f of files) console.log(`  ${path.join(OUT, f)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
