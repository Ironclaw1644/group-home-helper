/**
 * Record the demo film's footage by driving the real product.
 *
 * Nothing here is a mockup. It opens the same public demo a stranger opens,
 * fills a note the way a DSP fills one, signs it, and opens the PDF that comes
 * out. If the product breaks, this breaks, which is the point: a demo that
 * cannot be produced by using the software is a promise the software has not
 * made.
 *
 *   npm run video:capture              # against localhost:3000
 *   SHOT_BASE_URL=https://flipbrief.com npm run video:capture
 *
 * Writes tmp/demo-video/raw.webm and tmp/demo-video/beats.json, the latter
 * being the timestamp each beat started at. scripts/build-demo-video.sh cuts
 * on those rather than on guessed offsets, so a slow draft on the day does not
 * slide every later caption out of sync.
 *
 * Two things differ from capture-walkthrough.ts, which takes the stills:
 *
 * 1. Motion is left on. The stills disable it so a frame cannot catch a
 *    half-faded card; film wants the opposite.
 * 2. Taps are drawn. Playwright moves no visible cursor, so a recording of it
 *    shows the screen changing for no reason a viewer can see. A ripple is
 *    injected at each click point — the same affordance a phone screen
 *    recording gets from the OS.
 */

import { chromium, type Page } from 'playwright';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:3000';
const OUT = path.join(process.cwd(), 'tmp', 'demo-video');

/** The phone a DSP is holding. */
const PHONE = { width: 390, height: 844 };

type Beat = { name: string; at: number };
const beats: Beat[] = [];
let t0 = 0;

function mark(name: string) {
  const at = (Date.now() - t0) / 1000;
  beats.push({ name, at });
  console.log(`  ${at.toFixed(1).padStart(6)}s  ${name}`);
}

/** A visible tap. Injected once per page load. */
const TAP_INDICATOR = `
(() => {
  if (window.__tapInit) return;
  window.__tapInit = true;
  const style = document.createElement('style');
  style.textContent = \`
    .__tap {
      position: fixed; z-index: 2147483647; pointer-events: none;
      width: 46px; height: 46px; margin: -23px 0 0 -23px;
      border-radius: 50%; background: rgba(20,69,47,.28);
      border: 2px solid rgba(20,69,47,.55);
      animation: __tapPop .55s ease-out forwards;
    }
    @keyframes __tapPop {
      0%   { transform: scale(.35); opacity: .95; }
      100% { transform: scale(1.5);  opacity: 0; }
    }\`;
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

/** Click something, showing where the finger went. */
async function tap(page: Page, locator: ReturnType<Page['locator']>) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(180);
  const box = await locator.boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.evaluate(([px, py]) => (window as any).__tap?.(px, py), [x, y]);
    await page.waitForTimeout(120);
  }
  await locator.click();
  await page.waitForTimeout(260);
}

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
    // The recording size must equal the viewport. Asking for 2x here does not
    // render the page larger — Playwright draws the 390x844 page into the
    // top-left of a 780x1688 canvas and leaves the rest grey, which is exactly
    // what the first cut of this film looked like. Upscaling belongs in the
    // encoder, where it is a scale filter and not three quarters of dead frame.
    acceptDownloads: true,
    recordVideo: { dir: OUT, size: PHONE }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(90_000);

  const inject = async () => {
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' }).catch(() => {});
    await page.evaluate(TAP_INDICATOR).catch(() => {});
  };
  page.on('load', () => void inject());

  t0 = Date.now();

  mark('open');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await inject();
  await page.waitForTimeout(1200);

  mark('demo-start');
  await tap(page, page.getByRole('button', { name: /try it yourself/i }).first());
  await page.waitForURL((u) => !/\/(login|signup)/.test(u.pathname), { timeout: 120_000 });
  await page.getByRole('link', { name: /start .* note/i }).waitFor({ timeout: 120_000 });
  await inject();
  await page.waitForTimeout(900);

  mark('roster');
  await page.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' }));
  await page.waitForTimeout(1400);

  mark('open-note');
  await tap(page, page.getByRole('link', { name: /start .* note/i }).first());
  await page.waitForURL(/\/notes\//);
  await page.getByRole('button', { name: /write from my entries/i }).waitFor();
  await inject();
  await page.waitForTimeout(900);

  // Answer the form the way a DSP does: every group, top to bottom. Re-scanned
  // each pass because answering a service-plan goal reveals four more
  // questions underneath it.
  // Every group must be answered or the app refuses to sign — correctly, and
  // it says so on screen. An earlier version of this capped the taps per pass
  // to keep the film short and then timed out on a permanently disabled Sign
  // button, which is the product working, not a bug to route around.
  mark('chips');
  await answerEverything(page);
  await page.waitForTimeout(600);

  // The service-plan goals. These are not `role="group"` chips and were the
  // reason an earlier version sat forever on a disabled Sign button: the app
  // refuses to sign while any goal is unruled, because a signed note is
  // permanent and must not contain an outcome nobody decided on.
  //
  // The first goal gets "Worked on this", which unfolds four more questions
  // underneath it — that unfolding is the plan being documented inside the
  // note rather than in a second system, and it is worth showing. The rest get
  // "Not this shift", which is also what an honest shift usually looks like.
  mark('plan');
  const worked = page.getByRole('button', { name: /worked on this/i });
  if (await worked.count()) {
    await tap(page, worked.first());
    await page.waitForTimeout(900);
    await answerEverything(page);
  }
  for (let i = 0; i < 8; i += 1) {
    const notThis = page.getByRole('button', { name: /not this shift/i });
    const n = await notThis.count();
    let tapped = 0;
    for (let j = 0; j < n; j += 1) {
      const b = notThis.nth(j);
      if ((await b.getAttribute('aria-pressed')) === 'true') continue;
      const card = b.locator('xpath=ancestor::*[self::div][1]');
      if ((await card.locator('[aria-pressed="true"]').count()) > 0) continue;
      await tap(page, b);
      tapped += 1;
    }
    if (tapped === 0) break;
  }
  await answerEverything(page);
  await page.waitForTimeout(600);

  mark('draft');
  await tap(page, page.getByRole('button', { name: /write from my entries/i }));
  await page.getByText('Saved', { exact: true }).waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1600);

  mark('narrative');
  await page.evaluate(() => window.scrollBy({ top: 320, behavior: 'smooth' }));
  await page.waitForTimeout(2200);

  mark('sign');
  await signTyped(page);
  await page.waitForTimeout(1200);

  mark('attest');
  await tap(page, page.getByRole('checkbox').last());
  await page.waitForTimeout(700);

  // Marked after the click resolves, not before it. Marking first put the
  // caption "Signed is locked" on screen while the button was still visibly
  // disabled and the app was still saying "Add more detail before signing" —
  // a caption contradicting the picture underneath it, which is the one thing
  // a demo film cannot survive.
  await tap(page, page.getByRole('button', { name: /sign and lock note/i }));
  await page.getByRole('link', { name: /open the pdf to print/i }).waitFor({ timeout: 90_000 });
  await inject();
  mark('lock');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(2600);

  mark('end');
  await page.waitForTimeout(1200);

  // The letterhead, which is the thing actually being sold and was the one
  // thing the first cut never showed — it captioned "it prints on your
  // letterhead" over a picture of the app instead.
  //
  // The PDF route sends the file rather than rendering it, so navigating to it
  // downloads instead of displaying. Take the download, rasterise page one,
  // and let the build script hold it as the closing shot. This is the real
  // document the app just produced, not a mockup of one.
  const download = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    tap(page, page.getByRole('link', { name: /open the pdf to print/i }))
  ]).then(([d]) => d);
  const pdfPath = path.join(OUT, 'note.pdf');
  await download.saveAs(pdfPath);
  await run('pdftoppm', ['-png', '-r', '150', '-f', '1', '-l', '1', pdfPath,
                         path.join(OUT, 'letterhead')]);
  console.log('  letterhead rasterised from the real PDF');

  await context.close();
  await browser.close();

  await writeFile(path.join(OUT, 'beats.json'), JSON.stringify(beats, null, 2));
  console.log(`\nfootage and beats in ${OUT}`);
}

/**
 * Which option to tap in a group.
 *
 * Taking the first one in every group produced a note that contradicted
 * itself: it answered "Stayed home" to where the resident went and then took
 * an exhibit-flavoured answer to what they did there, and the draft — grounded
 * faithfully in both — read "prompting Maria to stay home where she looked at
 * exhibits". The drafting was right. The taps were nonsense.
 *
 * That sentence would have been the closing frame of a sales film, printed on
 * the letterhead, held on screen for four seconds. So where a group offers an
 * outing, take it, and the activity answers then agree with it.
 */
const PREFERRED = [/museum/i, /community/i];

async function preferredChoice(group: ReturnType<Page['locator']>) {
  for (const want of PREFERRED) {
    const options = group.locator('[aria-pressed="false"]');
    const n = await options.count();
    for (let i = 0; i < n; i += 1) {
      const opt = options.nth(i);
      if (want.test((await opt.textContent()) ?? '')) return opt;
    }
  }
  const first = group.locator('[aria-pressed="false"]').first();
  return (await first.count()) ? first : null;
}

/**
 * Answer every unanswered chip group, re-scanning until none are left.
 *
 * Re-scanning matters: answering a service-plan goal reveals four more
 * questions beneath it, so a single pass leaves the form incomplete and the
 * Sign button correctly disabled.
 */
async function answerEverything(page: Page) {
  for (let pass = 0; pass < 12; pass += 1) {
    const groups = page.locator('[role="group"]');
    const count = await groups.count();
    let tapped = 0;
    for (let i = 0; i < count; i += 1) {
      const group = groups.nth(i);
      if ((await group.locator('[aria-pressed="true"]').count()) > 0) continue;
      const choice = await preferredChoice(group);
      if (!choice) continue;
      await tap(page, choice);
      tapped += 1;
    }
    if (tapped === 0) return;
  }
}

/** Use the app's own typed-signature mode: type the name, it renders cursive. */
async function signTyped(page: Page) {
  await tap(page, page.getByRole('button', { name: /^type$/i }));
  const field = page.getByPlaceholder(/type your (full )?name/i).first();
  await field.waitFor({ timeout: 20_000 });
  await field.click();
  // Clear first. The field arrives pre-filled with the signer's name, so
  // typing into it produced "Robin VanceRobin Vance" and a cursive rendering
  // that ran off its own line — on camera, in the frame the whole film is
  // building towards.
  await field.fill('');
  await page.waitForTimeout(250);
  // Then a character at a time, so the cursive builds on camera rather than
  // appearing whole. That is the moment worth filming.
  for (const ch of 'Robin Vance') {
    await field.type(ch, { delay: 90 });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
