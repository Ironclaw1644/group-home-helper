/**
 * Capture the walkthrough frames on the landing page from the real app.
 *
 * The frames under `public/walkthrough/` are photographs of this application,
 * driven end to end through the same demo entry point a visitor uses:
 * provision a sandbox, open a resident's note, answer the form, generate the
 * draft, sign it, and render the PDF. Nothing is mocked and nothing is drawn
 * in a design tool. If a screen changes, re-run this and the landing page
 * stops lying.
 *
 *   npm run dev            # in another terminal
 *   npm run shots:walkthrough
 *
 * The phone frames are taken at 390x844 — a Pixel/iPhone-class viewport, the
 * size a DSP actually holds — at deviceScaleFactor 2, so they stay sharp on a
 * high-density screen without shipping megabytes to a phone on cell data.
 *
 * The last frame is not a screenshot. It is page one of the PDF the app just
 * rendered, rasterised with `pdftoppm`, because the claim being made there is
 * about the printed document rather than about a screen.
 */
import { chromium, type Page } from 'playwright';
import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile, readdir, rename } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:3000';
const OUT = path.join(process.cwd(), 'public', 'walkthrough');
const TMP = path.join(process.cwd(), 'tmp');

/** The phone a DSP is holding. */
const PHONE = { width: 390, height: 844 };

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(TMP, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    // The frames are meant to be legible, not to advertise motion. Reveal
    // animations settle instantly so a capture cannot catch a half-faded card.
    reducedMotion: 'reduce'
  });

  const page = await context.newPage();
  page.setDefaultTimeout(45_000);

  // The dev server paints its own build-status badge over the bottom-left
  // corner, which lands on top of the "Today" tab in every phone frame. It is
  // the toolchain's, not the product's, so it has no business in a screenshot
  // of the product.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' }).catch(() => {});
  page.on('load', () => {
    void page
      .addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
      .catch(() => {});
  });

  console.log('· starting a demo sandbox');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /try it yourself/i }).first().click();

  // Provisioning creates an org, residents, plans and shifts, then signs in.
  await page.waitForURL((u) => !/\/(login|signup)/.test(u.pathname), { timeout: 90_000 });
  await page.getByRole('link', { name: /start .* note/i }).waitFor({ timeout: 90_000 });
  await settle(page);

  console.log('· 01 pick a resident');
  // The roster sits below the greeting and the setup checklist. The checklist
  // is real, but it is what a brand-new workspace shows and not what this
  // frame is claiming — the claim is "here are the people and the shifts", so
  // scroll to the people.
  await scrollToRoster(page);
  await settle(page);
  await shot(page, '01-pick-resident');

  console.log('· 02 tap what happened');
  await page.getByRole('link', { name: /start .* note/i }).first().click();
  await page.waitForURL(/\/notes\//);
  await page.getByRole('button', { name: /write from my entries/i }).waitFor();
  await settle(page);

  // Answer the form the way a DSP would, in the two passes the editor needs.
  //
  // The first pass is the form proper. `role="group"` is what distinguishes a
  // ChipGroup from the service-plan outcome chips further up the page, and the
  // distinction matters: "Write from my entries" is enabled by
  // hasAnySelection(), which walks `schema.sections` only. Tapping fourteen
  // outcome chips leaves the draft button disabled, which is exactly what it
  // did before this selector was scoped.
  const groups = page.locator('div[role="group"]');
  const groupCount = await groups.count();
  let tapped = 0;

  for (let g = 0; g < groupCount; g++) {
    const chip = groups.nth(g).locator('button[aria-pressed="false"]').first();
    if ((await chip.count()) === 0) continue;
    try {
      await chip.scrollIntoViewIfNeeded({ timeout: 4000 });
      await chip.click({ timeout: 4000 });
      tapped++;
    } catch {
      // A chip that will not take a tap is not worth failing the run over.
    }
  }

  // The second pass is the service plan. Every outcome has to carry an answer
  // before the note can be signed, and "Worked on this" is the one that makes
  // the frame show a plan being documented rather than skipped.
  const worked = page.getByRole('button', { name: /worked on this/i });
  const outcomes = await worked.count();
  for (let o = 0; o < outcomes; o++) {
    try {
      await worked.nth(o).scrollIntoViewIfNeeded({ timeout: 4000 });
      await worked.nth(o).click({ timeout: 4000 });
    } catch {
      // Same.
    }
  }

  console.log(`  tapped ${tapped} form chips across ${groupCount} groups, ${outcomes} outcomes`);

  // Frame the first section rather than wherever the last tap left us — the
  // point of this frame is what the form looks like, not how far down it goes.
  await scrollToHeading(page, 1);
  await settle(page);
  await shot(page, '02-tap-what-happened');

  console.log('· 03 the draft writes itself');
  // Autosave is debounced and the draft endpoint re-reads the note from the
  // database, so generating before the save lands returns "record what
  // happened first" on a screen full of answers. Wait for the indicator.
  await page.getByText('Saved', { exact: true }).waitFor({ timeout: 30_000 });

  const draftButton = page.getByRole('button', { name: /write from my entries/i });
  await draftButton.scrollIntoViewIfNeeded();
  await draftButton.click();

  const narrative = page.locator('textarea').last();
  await page
    .getByRole('button', { name: /write from my entries/i })
    .waitFor({ state: 'visible', timeout: 180_000 });
  await page.waitForFunction(
    () => {
      const areas = Array.from(document.querySelectorAll('textarea'));
      const last = areas[areas.length - 1] as HTMLTextAreaElement | undefined;
      return !!last && last.value.trim().length > 120;
    },
    undefined,
    { timeout: 180_000 }
  );

  await narrative.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -90));
  await settle(page);
  await shot(page, '03-draft-writes-itself');

  console.log('· 04 sign');
  await signTyped(page);

  await page.getByRole('checkbox').last().check();
  // Bring "Sign and lock note" into the frame — a signing screen that stops
  // above the button is showing the setup and not the act.
  await page.getByRole('button', { name: /sign and lock note/i }).scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 40));
  await settle(page);
  await shot(page, '04-sign-on-the-glass');

  console.log('· signing and locking');
  await page.getByRole('button', { name: /sign and lock note/i }).click();
  await page.getByRole('link', { name: /open the pdf to print/i }).waitFor({ timeout: 60_000 });

  const noteUrl = new URL(page.url());
  const noteId = noteUrl.pathname.split('/').filter(Boolean)[1];

  console.log('· 05 it prints as the form');
  const pdf = await context.request.get(`${BASE}/notes/${noteId}/pdf`);
  if (!pdf.ok()) throw new Error(`PDF request failed: ${pdf.status()}`);

  const pdfPath = path.join(TMP, 'walkthrough-note.pdf');
  await writeFile(pdfPath, await pdf.body());
  await rasterizeFirstPage(pdfPath, path.join(OUT, '05-prints-on-your-letterhead.png'));

  await browser.close();

  const written = (await readdir(OUT)).filter((f) => f.endsWith('.png')).sort();
  console.log(`\n${written.length} frames in public/walkthrough:`);
  for (const f of written) console.log('  ' + f);
}

/**
 * Draw a signature the way a finger does.
 *
 * An evenly-spaced zigzag reads as a graph, not a name, and it ends up on the
 * printed form as well as on the screen — so it is worth the trouble to make
 * it look like handwriting. Two strokes, the way most people sign: a given
 * name with a tall ascender, a lift, then a surname with a trailing flourish.
 * Amplitudes and spacing vary, and the curve is walked in small steps so the
 * pad's smoothing has something to work with.
 */
/**
 * Sign by typing the name, the way the product's own "Type" mode works.
 *
 * Earlier revisions drove the drawing canvas with a synthesised stroke. Even
 * done well that is a machine imitating handwriting, and it looked like one.
 * The app already offers a typed signature rendered in a script face, which is
 * both what e-signature products do and what a DSP on a phone would actually
 * pick — so the honest capture is to use it.
 */
async function signTyped(page: Page) {
  await page.getByRole('button', { name: /^type$/i }).click();

  const field = page.getByPlaceholder(/type your full name/i);
  await field.scrollIntoViewIfNeeded();
  await field.fill('');
  // Typed rather than filled, so the debounced canvas render runs as it would
  // for a person.
  await field.pressSequentially('Robin Vance', { delay: 45 });

  // The canvas render waits on the webfont; give it the same chance.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);

  await page.evaluate(() => window.scrollBy(0, -40));
  await settle(page);
}

async function sign(page: Page, canvas: ReturnType<Page['locator']>) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no signature canvas');

  // The writing line, a little below centre, as on ruled paper.
  const baseline = box.y + box.height * 0.6;
  const at = (fx: number, fy: number): [number, number] => [
    box.x + box.width * fx,
    baseline + box.height * fy
  ];

  /**
   * Cursive glyphs, as parametric curves.
   *
   * Two earlier attempts failed the same way for the same reason. Both built
   * the stroke as a height for each horizontal position — corner points first,
   * then a sum of Gaussians. Anything of that shape is a function y = f(x)
   * with x strictly increasing, and a curve that can never travel leftwards
   * cannot cross itself. Handwriting is mostly loops: the pen goes back over
   * where it has been. That is why both attempts read as a chart.
   *
   * So each glyph is parametric in its own progress instead, free to move
   * backwards. `advance` is how far along the line the glyph carries the pen;
   * `w` is how far it swings either side of that while doing it. Where the
   * swing outruns the advance, the path loops, which is the whole point.
   *
   * y is negative above the writing line.
   */
  type Glyph = (t: number) => [number, number];

  // A closed loop: o, a, e. Up the left, over, down the right, back under.
  const oval = (advance: number, h: number, w: number): Glyph => (t) => [
    advance * t + w * Math.sin(2 * Math.PI * t),
    (-h * (1 - Math.cos(2 * Math.PI * t))) / 2
  ];

  // A tall thin loop: l, h, b, k. Same construction, taller and narrower.
  const ascender = (advance: number, h: number, w: number): Glyph => (t) => [
    advance * t + w * Math.sin(2 * Math.PI * t),
    (-h * (1 - Math.cos(2 * Math.PI * t))) / 2
  ];

  // A loop below the line: g, y, j, p.
  const descender = (advance: number, d: number, w: number): Glyph => (t) => [
    advance * t + w * Math.sin(2 * Math.PI * t),
    (d * (1 - Math.cos(2 * Math.PI * t))) / 2
  ];

  // A plain hump with no loop: n, m, r. Real hands mix these in.
  const arch = (advance: number, h: number): Glyph => (t) => [
    advance * t,
    -h * Math.sin(Math.PI * t)
  ];

  // The exit stroke: a long tail that runs out and lifts.
  const flourish = (advance: number, h: number): Glyph => (t) => [
    advance * t,
    -h * Math.sin(Math.PI * t) * (1 - 0.55 * t)
  ];

  /**
   * Walk a run of glyphs end to end, sampling each densely.
   *
   * The shear is what stops it looking like copperplate practice: a hand
   * writing at speed leans, so anything above the line is pushed right in
   * proportion to its height.
   */
  const SLANT = 0.3;

  const stroke = (from: number, glyphs: Glyph[]) => {
    const points: Array<[number, number]> = [];
    const SAMPLES = 46;
    let cursor = from;

    for (const glyph of glyphs) {
      for (let i = 0; i <= SAMPLES; i++) {
        const [dx, dy] = glyph(i / SAMPLES);
        points.push([cursor + dx - SLANT * dy * 0.35, dy]);
      }
      // Advance by where the glyph actually left the pen, so the next one
      // starts from there rather than from a nominal width.
      cursor += glyph(1)[0];
    }

    return points;
  };

  // No two letters the same size, and the two words given different rhythms —
  // repetition is what made the earlier attempts read as a pattern.
  const strokes = [
    // Given name: tall capital, then a descender dropping through the line.
    stroke(0.04, [
      ascender(0.085, 1.05, 0.062),
      oval(0.055, 0.34, 0.04),
      arch(0.05, 0.3),
      descender(0.052, 0.4, 0.034),
      oval(0.048, 0.24, 0.03),
      arch(0.04, 0.22)
    ]),
    // Surname: capital, an arch before the first oval, and a long exit tail.
    stroke(0.5, [
      ascender(0.08, 0.92, 0.048),
      arch(0.046, 0.26),
      oval(0.06, 0.36, 0.044),
      arch(0.04, 0.21),
      oval(0.044, 0.25, 0.028),
      flourish(0.185, 0.17)
    ])
  ];

  for (const points of strokes) {
    const [sx, sy] = at(points[0][0], points[0][1]);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (const [fx, fy] of points.slice(1)) {
      const [x, y] = at(fx, fy);
      await page.mouse.move(x, y);
    }
    await page.mouse.up();
  }
}

/**
 * Scroll the home page to the roster.
 *
 * Anchored on the shift links rather than on a heading, because those are what
 * make the frame legible as a list of people with shifts to write.
 */
async function scrollToRoster(page: Page) {
  await page.evaluate(() => {
    // Anchor on the section label, not the first shift card. Leading in from
    // the card pulled the tail of the Documents panel above it into frame.
    const label = Array.from(document.querySelectorAll('h1, h2, h3, p, span, div')).find(
      (el) => /today'?s shifts/i.test(el.textContent ?? '') && el.children.length === 0
    );

    const anchor =
      label ??
      Array.from(document.querySelectorAll('a')).find((a) =>
        /\d(AM|PM)-\d/.test(a.textContent ?? '')
      );
    if (!anchor) return;

    const wanted = anchor.getBoundingClientRect().top + window.scrollY - 78;
    window.scrollTo(0, Math.max(0, wanted));

    // With only three residents the roster is barely taller than the phone, so
    // the page is already at its scroll limit here and no offset can push the
    // panel above the list out of frame. Two attempts at a lead-in offset
    // failed for that reason. When the scroll cannot reach the target, go to
    // the top instead: a whole card reads as the app, a sliced one reads as a
    // broken screenshot.
    const reached = Math.abs(window.scrollY - Math.max(0, wanted)) < 4;
    if (!reached) window.scrollTo(0, 0);
  });
}

/** Put the nth form section at the top of the viewport. */
async function scrollToHeading(page: Page, index: number) {
  await page.evaluate((i) => {
    const cards = Array.from(document.querySelectorAll('h2'));
    const target = cards[i] ?? cards[0];
    if (target) {
      const top = target.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo(0, Math.max(0, top));
    }
  }, index);
}

/** Let fonts, images and any in-flight paint finish before the shutter. */
async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

/**
 * Page one of the PDF, as an image.
 *
 * Rendered at 150 DPI and then handed to `sips` to come down to the width the
 * page displays it at — the frame is a proof that the letterhead is real, not
 * something anybody is going to read at full size.
 */
async function rasterizeFirstPage(pdfPath: string, outPath: string) {
  const stem = path.join(TMP, 'walkthrough-page');
  await run('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', pdfPath, stem]);

  const produced = (await readdir(TMP)).find(
    (f) => f.startsWith('walkthrough-page') && f.endsWith('.png')
  );
  if (!produced) throw new Error('pdftoppm produced nothing');

  await rename(path.join(TMP, produced), outPath);
  await run('sips', ['--resampleWidth', '900', outPath]);
  await rm(pdfPath, { force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
