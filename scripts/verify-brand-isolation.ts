/**
 * Prove the two halves of the branding contract against a running app.
 *
 *   npm run dev            # in another terminal
 *   npm run verify:brand-isolation
 *
 * One deployment serves several agencies and one public page, and those two
 * facts pull in opposite directions:
 *
 *   1. An agency that sets their own palette must get it. Every `brand-*`
 *      class in the signed-in app resolves through CSS custom properties that
 *      are emitted per request, so this has to survive any change to the
 *      default palette.
 *
 *   2. The landing page must be immune to it. It is served to strangers, and
 *      it must not repaint itself because of whoever last themed a workspace
 *      in that browser. That is why it is painted in fixed `flip-*` literals
 *      and never in `--brand-*`.
 *
 * The second is the one that rots quietly: someone reaches for `brand-navy` on
 * a marketing component because it is the colour they wanted, and nothing
 * looks wrong until a customer with a pink palette sends the page to a friend.
 * So it is tested adversarially — the page is served hostile `--brand-*`
 * values and has to render identically to the pixel.
 */
import { chromium, type Page } from 'playwright';
import { createHash } from 'node:crypto';

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:3000';

/** Nothing in FlipBrief's palette is near these. A leak will be obvious. */
const HOSTILE = {
  navy: '#c2185b',
  teal: '#ff4081',
  aqua: '#f8bbd0',
  sand: '#fce4ec',
  slate: '#ad1457'
};

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok     ${name}`);
  } else {
    failures++;
    console.log(`  FAIL   ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** The resolved value of a CSS custom property on <html>. */
function brandVar(page: Page, name: string) {
  return page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name
  );
}

/**
 * A full-page screenshot the page has settled into, as a hash.
 *
 * The first capture after load is never reproducible — lazily-decoded images
 * and the reveal observer are still resolving, and the very next shot differs
 * from it while every shot after that is identical. Comparing against that
 * first frame reports a theming leak on a page that has none. So: scroll the
 * whole page to force the lazy images, wait, and throw the first one away.
 */
async function stableShot(page: Page): Promise<string> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);

  // A full-page capture scrolls the page itself, which is what settles the
  // lazy images and the reveal observer. Taking one and throwing it away is
  // therefore the warm-up; every capture after it is identical.
  await page.screenshot({ fullPage: true });
  await page.waitForTimeout(600);

  return createHash('sha256').update(await page.screenshot({ fullPage: true })).digest('hex');
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    // The walkthrough autoplays. Two full-page screenshots taken seconds apart
    // would differ because the carousel advanced, not because anything was
    // themed — which is a false failure that hides a real one. Under
    // reduce-motion the walkthrough renders as its static strip and no timer
    // runs, so a pixel comparison means what it says. The colour scan below
    // covers the carousel's own markup regardless.
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);

  // ---------------------------------------------------------------------
  console.log('\nThe landing page ignores a themed workspace\n');

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /try it yourself/i }).first().waitFor();

  const before = await stableShot(page);

  // The control. If two untouched captures of the same page disagree, the
  // comparison below cannot distinguish a theming leak from ordinary render
  // noise, and a pass would mean nothing.
  const control = await stableShot(page);
  check(
    'the page renders identically twice, so a pixel comparison is meaningful',
    control === before,
    'the landing page is not deterministic; the isolation result below is unreliable'
  );

  // Force the variables a themed organization would have set, at the same
  // place the app sets them — on :root, after the stylesheet. If any part of
  // this page reads them, the pixels move.
  await page.addStyleTag({
    content: `:root {
      --brand-navy: 194 24 91;
      --brand-teal: 255 64 129;
      --brand-aqua: 248 187 208;
      --brand-sand: 252 228 236;
      --brand-slate: 173 20 87;
      --brand-font: 'Comic Sans MS';
    }`
  });
  const after = await stableShot(page);

  check(
    'hostile --brand-* variables change nothing on the public page',
    before === after,
    before === after ? undefined : 'the landing page is reading per-organization tokens'
  );

  // The variables really were applied — otherwise the test above passes for
  // the wrong reason and would keep passing if the page started using them.
  check(
    'and the variables were genuinely present while that was measured',
    (await brandVar(page, '--brand-navy')) === '194 24 91'
  );

  // A pixel hash only covers what is painted at that moment. The carousel has
  // four frames it is not currently showing, and a hidden element that leaks
  // would slip past. So walk every element on the page — shown or not — and
  // resolve its colours.
  const leaks = await page.evaluate((hostile) => {
    const found: string[] = [];
    const wanted = new Set(hostile);

    for (const el of Array.from(document.querySelectorAll('.fb, .fb *'))) {
      const s = getComputedStyle(el);
      for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'fill', 'stroke']) {
        const value = s[prop as keyof CSSStyleDeclaration] as string;
        if (typeof value === 'string' && wanted.has(value)) {
          found.push(`${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 40)} ${prop}=${value}`);
        }
      }
    }
    return found.slice(0, 5);
  }, ['rgb(194, 24, 91)', 'rgb(255, 64, 129)', 'rgb(248, 187, 208)', 'rgb(252, 228, 236)', 'rgb(173, 20, 87)']);

  check(
    'no element anywhere in the page resolves to a themed colour',
    leaks.length === 0,
    leaks.join('; ')
  );

  const font = await page.evaluate(
    () => getComputedStyle(document.querySelector('.fb') as Element).fontFamily
  );
  check(
    'and the page is still set in its own typeface, not the agency’s',
    !/comic sans/i.test(font),
    font
  );

  // ---------------------------------------------------------------------
  console.log('\nAn agency that sets a palette still gets it\n');

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /try it yourself/i }).first().click();
  await page.getByRole('link', { name: /start .* note/i }).waitFor({ timeout: 120_000 });

  const shipped = await brandVar(page, '--brand-navy');
  check(
    'a workspace that has themed nothing gets FlipBrief forest',
    shipped === '20 69 47',
    `--brand-navy is "${shipped}"`
  );

  // Save a palette the way an administrator does — through the real endpoint,
  // not by writing to the table.
  const res = await page.request.patch(`${BASE}/api/settings`, {
    data: { colors: HOSTILE }
  });
  check(`PATCH /api/settings accepted the palette (${res.status()})`, res.ok());

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const themedApp = await brandVar(page, '--brand-navy');
  check(
    'and after saving, the app is painted in the agency’s own colour',
    themedApp === '194 24 91',
    `--brand-navy is "${themedApp}", expected the saved palette`
  );

  // ---------------------------------------------------------------------
  console.log('\nAnd the public page is still unmoved by it\n');

  // Sign out and come back to the public page in the same browser — the exact
  // sequence that would leave a themed page behind if anything were cached or
  // carried in a cookie.
  await context.clearCookies();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /try it yourself/i }).first().waitFor();

  const afterSignOut = await stableShot(page);

  check(
    'the landing page is pixel-identical after a themed session in this browser',
    afterSignOut === before,
    'the public page changed after an agency themed their workspace'
  );

  const publicVar = await brandVar(page, '--brand-navy');
  check(
    'and it is served the default tokens, not the last agency’s',
    publicVar === '20 69 47',
    `--brand-navy is "${publicVar}"`
  );

  await browser.close();

  console.log(
    failures === 0
      ? '\nAll brand-isolation checks passed.\n'
      : `\n${failures} brand-isolation check(s) FAILED.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
