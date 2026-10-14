/**
 * Record the landing-page films by using the real product.
 *
 *   npm run films:record -- note        # or form, setup, letterhead
 *   FILMS_BASE=http://localhost:3000 npm run films:record -- note
 *
 * Every flow opens a fresh demo sandbox through the same "Try it yourself"
 * button a visitor presses, then drives it the way an admin or a DSP would.
 * Nothing is staged and nothing is drawn: the film is this footage, and
 * films/ (Remotion) only puts a frame, captions and a camera around it.
 *
 * WHY A SCREENCAST AND NOT recordVideo
 *
 * Playwright's recordVideo writes VP8 at the CSS viewport size, so a 390px
 * phone came out 390px wide and every zoom made it softer. The CDP screencast
 * can send real device pixels (1170px wide, given the flag below) with a
 * timestamp per frame; tmp/films/<flow>/frames.json keeps those times so the
 * assembler can lay them on a fixed 30 fps clock.
 *
 * Taps are not drawn on the page. Their position and time go to taps.json and
 * the film draws the tap ring, so the footage stays exactly what the browser
 * painted.
 */
import { chromium, type Locator, type Page } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = (process.env.FILMS_BASE ?? 'https://flipbrief.com').replace(/\/$/, '');
/** The page area. The film draws a status bar above it, so this is a phone minus 44px. */
export const VIEW = { width: 390, height: 800 };
const DPR = 3;

type Ctx = {
  page: Page;
  base: string;
  tap: (l: Locator, opts?: { force?: boolean }) => Promise<void>;
  type: (l: Locator, text: string, delay?: number) => Promise<void>;
  mark: (name: string) => void;
  scrollTo: (l: Locator, block?: 'start' | 'center' | 'end') => Promise<void>;
  scrollBy: (dy: number) => Promise<void>;
  wait: (ms: number) => Promise<void>;
  go: (p: string) => Promise<void>;
};

const FIX = path.join(process.cwd(), 'scripts', 'fixtures');

const FLOWS: Record<string, (c: Ctx) => Promise<void>> = {
  /**
   * A DSP's note, from Today to the next person's note.
   */
  async note({ page, tap, type, mark, scrollTo, wait }) {
    await wait(1200);
    mark('today');
    await wait(2200);
    await tap(page.getByRole('link', { name: /start .* note/i }).first());
    await page.waitForURL(/\/notes\/[0-9a-f-]{36}/, { timeout: 60_000 });
    await page.waitForLoadState('networkidle');
    await wait(1400);
    mark('opened');
    await wait(1800);

    // The service plan first, answered the way a DSP answers it: by tapping.
    const worked = page.getByRole('button', { name: 'Worked on this' }).first();
    await scrollTo(worked, 'center');
    await wait(700);
    mark('plan');
    await tap(worked);
    await wait(700);
    // Its support activities, as the DSP would answer them.
    const yes = page.getByRole('button', { name: /^yes$/i });
    for (let i = 0; i < Math.min(2, await yes.count()); i++) {
      await scrollTo(yes.nth(i), 'center');
      await tap(yes.nth(i));
      await wait(350);
    }
    const help = page.getByRole('button', { name: /verbal prompt/i }).first();
    if (await help.count()) await tap(help);
    else await tap(page.locator('text=How much help was needed?').locator('xpath=following-sibling::div[1]//button').first());
    await wait(500);
    const went = page.locator('text=How did it go?').locator('xpath=following-sibling::div[1]//button').first();
    if (await went.count()) await tap(went);
    await wait(600);
    // Any other outcome on this plan: not this shift. A real answer.
    for (const b of await page.getByRole('button', { name: 'Not this shift' }).all()) {
      if (await b.getAttribute('aria-pressed') === 'true') continue;
      await scrollTo(b.first(), 'center');
      await tap(b);
      await wait(400);
    }

    // What happened on the shift.
    const groups = await page.locator('[role="group"]').all();
    if (groups.length) {
      await scrollTo(groups[0], 'start');
      await wait(600);
      mark('chips');
      for (const g of groups.slice(0, 3)) {
        const b = g.locator('button').first();
        await scrollTo(b, 'center');
        await tap(b);
        await wait(450);
      }
    }
    await wait(800);

    // The pinned bar holds the next step: write. Bring the empty note box
    // into view first, so the draft is seen arriving.
    await scrollTo(page.locator('textarea.field-input').first(), 'center');
    await wait(900);
    mark('write');
    const draft = page.waitForResponse((r) => r.url().includes('/api/ai/draft'), { timeout: 90_000 });
    await tap(page.getByRole('button', { name: 'Write my note' }).last());
    mark('drafting');
    const res = await draft;
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    await page.waitForFunction(
      () => ((document.querySelector('textarea.field-input') as HTMLTextAreaElement | null)?.value ?? '').length > 40,
      null,
      { timeout: 60_000 }
    );
    mark('drafted');
    writeFileSync(
      path.join(OUT, 'draft.json'),
      JSON.stringify({ provider: body.provider, model: body.model, modelSeconds: body.elapsedSeconds }, null, 2)
    );
    await scrollTo(page.locator('textarea.field-input').first(), 'center');
    await wait(4200);

    await tap(page.getByRole('button', { name: /review and sign/i }).last());
    await wait(1200);
    mark('sign');
    const typeBtn = page.getByRole('button', { name: /^type$/i });
    if (await typeBtn.count()) await tap(typeBtn.first());
    const name = page.getByPlaceholder(/type your full name/i);
    await name.fill('');
    await type(name, 'Robin Vance', 70);
    await page.evaluate(() => document.fonts.ready);
    await wait(700);
    await tap(page.getByRole('checkbox').last());
    await wait(900);
    await tap(page.getByRole('button', { name: /sign and lock note/i }).last());
    await page.getByText(/signed and locked/i).first().waitFor({ timeout: 30_000 });
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await wait(1000);
    mark('signed');
    await wait(2600);
    await scrollTo(page.getByText(/this note is signed and locked/i).first(), 'center');
    await wait(600);
    mark('locked');
    await wait(3400);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await wait(1200);
    // "Next · Maria's note · 7AM-7PM": the next unsigned note on this shift.
    const next = page.getByRole('link', { name: /^next/i }).first();
    mark('next');
    await wait(1200);
    if (await next.count()) {
      await tap(next);
      await page.waitForURL(/\/notes\/[0-9a-f-]{36}/, { timeout: 60_000 });
      await page.waitForLoadState('networkidle');
      await wait(2600);
    }
  },

  /**
   * The importer: a blank paper form becomes the form staff write on.
   */
  async form({ page, tap, mark, scrollTo, scrollBy, wait, go }) {
    await go('/forms?onboarding=1');
    await wait(1400);
    mark('start');
    await wait(2600);

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 20_000 }),
      tap(page.getByRole('button', { name: /choose photos or a pdf/i }).first())
    ]);
    await chooser.setFiles([1, 2, 3].map((n) => path.join(FIX, 'importer', 'wv', `page-${n}.png`)));
    await page.getByRole('img', { name: 'Page 3' }).waitFor({ timeout: 20_000 });
    await wait(900);
    mark('pages');
    await wait(2600);

    await tap(page.getByRole('button', { name: /read my form/i }));
    await page.getByTestId('import-reading').waitFor();
    mark('reading');
    await page.getByTestId('paper-preview').waitFor({ timeout: 180_000 });
    mark('read');
    await wait(1200);
    await scrollTo(page.getByTestId('paper-preview'), 'start');
    await wait(1600);
    mark('preview');
    // Down the filled-in page, slowly enough to read it.
    for (let i = 0; i < 4; i++) {
      await scrollBy(330);
      await wait(1500);
    }
    mark('made-up');
    await wait(1800);

    const confirm = page.getByRole('button', { name: /looks right — use this form/i });
    mark('confirm');
    await tap(confirm);
    await page.getByTestId('import-done').waitFor({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await scrollTo(page.getByTestId('import-done'), 'center');
    await wait(900);
    mark('done');
    await wait(3600);
  },

  /**
   * Setup: the three steps, with the people pasted from a spreadsheet and a
   * staff invite link at the end.
   */
  async setup({ page, tap, mark, scrollTo, wait, go, type }) {
    await go('/forms?onboarding=1');
    await wait(1400);
    mark('steps');
    await wait(3200);

    await tap(page.getByRole('link', { name: /your people/i }).first());
    await page.waitForURL(/residents\/import/);
    await page.waitForLoadState('networkidle');
    await wait(1400);
    mark('people');
    await wait(1600);

    // A roster as an old system exports it: comma-separated, header row
    // first. Pasted, not typed, because that is what a paste looks like.
    // (Cells copied straight out of Excel arrive tab-separated; the importer
    // reads those too since 10-14.)
    const rows = [
      ['First name', 'Last name', 'Room', 'Pronouns', 'Date of birth'],
      ['Dana', 'Okafor', '2A', 'she/her', '03/14/1979'],
      ['Luis', 'Ferreira', '2C', 'he/him', '11/02/1988'],
      ['Sam', 'Whitlock', '4', 'they/them', '07/21/1992'],
      ['Grace', 'Lindqvist', '5B', 'she/her', '01/30/1965']
    ];
    const box = page.locator('textarea').first();
    await scrollTo(box, 'center');
    await wait(500);
    await tap(box);
    await box.fill(rows.map((r) => r.join(',')).join('\n'));
    await wait(1200);
    mark('pasted');
    await wait(1800);
    await tap(page.getByRole('button', { name: /read this list/i }).first());
    const add = page.getByRole('button', { name: /^add \d+ residents?/i }).first();
    await add.waitFor({ timeout: 30_000 });
    await scrollTo(page.getByText(/check what it read/i).first(), 'start');
    await wait(1000);
    mark('check');
    await wait(3400);
    await scrollTo(add, 'center');
    await wait(600);
    await tap(add);
    await page.getByText(/import finished/i).first().waitFor({ timeout: 30_000 });
    await scrollTo(page.getByText(/import finished/i).first(), 'center');
    await wait(900);
    mark('added');
    await wait(2600);

    await tap(page.getByRole('link', { name: /next: invite your staff/i }).first());
    await page.waitForURL(/\/staff/);
    await page.waitForLoadState('networkidle');
    await wait(1200);
    mark('staff');
    await wait(1400);
    await tap(page.getByRole('button', { name: /invite/i }).first());
    await wait(900);
    const title = page.locator('#invite-title');
    if (await title.count()) {
      await scrollTo(title, 'center');
      await title.fill('');
      await type(title, 'DSP', 90);
      await wait(600);
    }
    mark('invite');
    const create = page.getByRole('button', { name: /create|make|get .*link/i }).first();
    await scrollTo(create, 'center');
    await tap(create);
    await page.getByRole('button', { name: /^copy$/i }).first().waitFor({ timeout: 20_000 });
    await scrollTo(page.getByRole('button', { name: /^copy$/i }).first(), 'center');
    await wait(900);
    mark('link');
    await wait(1600);
    await tap(page.getByRole('button', { name: /^copy$/i }).first());
    await wait(2600);
  },

  /**
   * The agency's own letterhead, colours and logo on the printed form.
   */
  async letterhead({ page, tap, type, mark, scrollTo, wait, go }) {
    await go('/settings');
    await wait(1000);
    const preview = page.getByText(/how the printed form will look/i).first();
    await scrollTo(preview, 'start');
    await wait(1200);
    mark('before');
    await wait(3000);

    const legal = page.locator('#b-legal');
    await scrollTo(legal, 'center');
    await wait(500);
    mark('identity');
    await legal.fill('');
    await type(legal, 'Harborlight Care Services, LLC', 45);
    await wait(400);
    const address = page.locator('#b-address');
    if (await address.count()) {
      await scrollTo(address, 'center');
      await address.fill('');
      await type(address, '44 Beacon Street, Norfolk, VA 23510', 35);
    }
    await wait(800);

    const upload = page.getByRole('button', { name: /^(upload|replace)$/i }).first();
    await scrollTo(upload, 'center');
    await wait(700);
    mark('logo');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 20_000 }), tap(upload)]);
    await chooser.setFiles(path.join(process.cwd(), 'public', 'demo', 'example-agency-logo.png'));
    await wait(2600);

    const palette = page.getByRole('button', { name: /harbor/i }).first();
    await scrollTo(palette, 'center');
    await wait(700);
    mark('colours');
    await tap(palette);
    await wait(900);
    const sample = page.locator('[aria-label="How your colours look"]').first();
    if (await sample.count()) {
      await scrollTo(sample, 'center');
      await wait(2600);
    }

    await scrollTo(preview, 'start');
    await wait(1200);
    mark('after');
    await wait(4200);

    const save = page.getByRole('button', { name: /^save/i }).first();
    await scrollTo(save, 'center');
    await wait(500);
    await tap(save);
    await page.waitForLoadState('networkidle');
    await wait(1400);
    // Saving re-renders the page from the top; go back to the document.
    await scrollTo(page.getByText(/how the printed form will look/i).first(), 'start');
    await wait(600);
    mark('saved');
    await wait(3600);
  }
};

const flowKey = process.argv[2];
if (!flowKey || !FLOWS[flowKey]) {
  console.error(`usage: films:record -- <${Object.keys(FLOWS).join('|')}>`);
  process.exit(1);
}
const OUT = path.join(process.cwd(), 'tmp', 'films', flowKey);

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, 'frames'), { recursive: true });

  // Without this flag the screencast arrives in CSS pixels whatever
  // deviceScaleFactor says: 390px wide, and soft the moment the film zooms.
  const browser = await chromium.launch({ args: [`--force-device-scale-factor=${DPR}`] });
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: DPR,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on('pageerror', (e) => console.log(`  PAGE ERROR ${e.message}`));
  page.on('load', () => void page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {}));

  const beats: { name: string; t: number }[] = [];
  const taps: { t: number; x: number; y: number }[] = [];
  const frames: { file: string; t: number }[] = [];
  let recording = false;
  let n = 0;
  const pending: Promise<unknown>[] = [];

  const cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
    void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    if (!recording) return;
    const file = `${String(n++).padStart(5, '0')}.jpg`;
    frames.push({ file, t: f.metadata.timestamp ?? Date.now() / 1000 });
    pending.push(writeFile(path.join(OUT, 'frames', file), Buffer.from(f.data, 'base64')));
  });

  const now = () => Date.now() / 1000;
  const ctx: Ctx = {
    page,
    base: BASE,
    wait: (ms) => page.waitForTimeout(ms),
    mark: (name) => {
      beats.push({ name, t: now() });
      console.log(`  ${name}`);
    },
    async tap(l, opts) {
      await l.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(250);
      const box = await l.boundingBox();
      if (box) taps.push({ t: now(), x: box.x + box.width / 2, y: box.y + box.height / 2 });
      await page.waitForTimeout(140);
      await l.click({ force: opts?.force });
      await page.waitForTimeout(300);
    },
    async type(l, text, delay = 55) {
      await l.click();
      await l.pressSequentially(text, { delay });
    },
    async scrollTo(l, block = 'center') {
      await l.evaluate((el, b) => el.scrollIntoView({ block: b as ScrollLogicalPosition, behavior: 'smooth' }), block);
      await page.waitForTimeout(750);
    },
    async scrollBy(dy) {
      await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), dy);
      await page.waitForTimeout(700);
    },
    async go(p) {
      await page.goto(BASE + p, { waitUntil: 'networkidle' });
    }
  };

  console.log(`· ${flowKey}: opening a demo sandbox on ${BASE}`);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /try it yourself/i }).first().click();
  await page.waitForURL((u) => !/\/(login|signup)/.test(u.pathname), { timeout: 120_000 });
  await page.getByRole('link', { name: /start .* note/i }).first().waitFor({ timeout: 120_000 });
  await page.waitForLoadState('networkidle');

  // Recording starts once the sandbox exists; provisioning is not the film.
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: VIEW.width * DPR,
    maxHeight: VIEW.height * DPR,
    everyNthFrame: 1
  });
  recording = true;
  // A screencast only sends a frame when something repaints; nudge one out.
  await page.evaluate(() => window.scrollBy(0, 1));
  await page.evaluate(() => window.scrollBy(0, -1));
  ctx.mark('begin');

  try {
    await FLOWS[flowKey](ctx);
    ctx.mark('end');
    await page.waitForTimeout(600);
  } catch (err) {
    await page.screenshot({ path: path.join(OUT, 'FAILED.png') }).catch(() => {});
    throw err;
  } finally {
    recording = false;
    await cdp.send('Page.stopScreencast').catch(() => {});
    await Promise.all(pending);
    await writeFile(
      path.join(OUT, 'capture.json'),
      JSON.stringify({ flow: flowKey, base: BASE, view: VIEW, dpr: DPR, beats, taps, frames }, null, 1)
    );
    await browser.close();
  }
  console.log(`\n${flowKey}: ${frames.length} frames, ${beats.length} beats, ${taps.length} taps -> ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
