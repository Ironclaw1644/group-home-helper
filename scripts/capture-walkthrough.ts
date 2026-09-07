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

  console.log('· 04 sign on the glass');
  const canvas = page.locator('canvas').first();
  await canvas.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -30));
  await settle(page);
  await sign(page, canvas);

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
   * One stroke, as a run of letter-shaped humps sitting on the writing line.
   *
   * Two earlier attempts got this wrong in instructive ways. A handful of
   * corner points came out as a line chart, because the pad joins the
   * positions it is given with straight segments. Sampling a sine fixed the
   * corners and produced an EKG, because handwriting is not periodic.
   *
   * What a signature actually is: mostly short humps returning to the line,
   * one or two tall ascenders, an occasional descender through it, and uneven
   * spacing throughout. So each hump is a Gaussian with its own centre,
   * height and width, summed and sampled densely. Negative height dips below
   * the line. A slight rightward lean is added at the end, the way a hand
   * moving across the page leans.
   */
  const stroke = (from: number, to: number, humps: Array<[number, number, number]>) => {
    const points: Array<[number, number]> = [];
    const SAMPLES = 110;

    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      let y = 0;
      for (const [centre, height, width] of humps) {
        y -= height * Math.exp(-((t - centre) ** 2) / (2 * width * width));
      }
      // The lean, plus a little settling so the stroke does not start and end
      // at exactly the same height.
      y += 0.07 * t - 0.02;
      points.push([from + (to - from) * t, y]);
    }

    return points;
  };

  const strokes = [
    // Given name: a tall capital, then five small letters, with one descender.
    stroke(0.07, 0.42, [
      [0.04, 0.62, 0.045],
      [0.19, 0.19, 0.038],
      [0.32, 0.25, 0.034],
      [0.45, -0.16, 0.030],
      [0.57, 0.21, 0.036],
      [0.71, 0.14, 0.040],
      [0.86, 0.23, 0.045]
    ]),
    // Surname: a second capital and a long flourish running out under the line.
    stroke(0.47, 0.94, [
      [0.05, 0.55, 0.042],
      [0.2, 0.16, 0.036],
      [0.31, 0.24, 0.032],
      [0.43, 0.13, 0.038],
      [0.55, -0.18, 0.034],
      [0.66, 0.2, 0.036],
      [0.8, 0.11, 0.05],
      [0.95, 0.16, 0.07]
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
    const shift = Array.from(document.querySelectorAll('a')).find((a) =>
      /\d(AM|PM)-\d/.test(a.textContent ?? '')
    );
    if (!shift) return;
    const card = shift.closest('section, div[class*="rounded"]') ?? shift;
    const top = card.getBoundingClientRect().top + window.scrollY - 105;
    window.scrollTo(0, Math.max(0, top));
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
