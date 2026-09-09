/**
 * Time one shift note, start to signed, and count the taps it took.
 *
 *   SHOT_BASE_URL=https://flipbrief.com npx tsx --tsconfig scripts/tsconfig.json scripts/time-a-note.ts [runs]
 *
 * WHY THIS EXISTS
 *
 * The landing page says a note is "twenty-seven taps, twenty-eight if you open
 * the PDF, plus about fifteen seconds while the draft is written", and the FAQ
 * invites the reader to count it themselves on the demo. The draft half of that
 * has been measured. The taps were counted once, by hand, and the elapsed time
 * was never measured at all — so any claim about how long a note takes was
 * going to be a guess, and scripts/build-demo-video.py already refuses one:
 * "nobody timed that, and an opening frame is a poor place to guess."
 *
 * So this times it, on the real product, and prints numbers somebody can argue
 * with.
 *
 * THE CADENCE IS THE HONEST PART
 *
 * A robot taps faster than a person, so the elapsed time depends entirely on
 * how long this waits between taps, and picking that number is picking the
 * answer. It is fixed at one second and printed in the output. That is slower
 * than the demo capture's own pacing (~0.56s) and slower than a DSP who has
 * done this a hundred times, so the total is a conservative one — the claim it
 * supports should be beatable by a real person, not the reverse.
 *
 * What the clock includes: from tapping the resident on the roster to the note
 * being signed and locked. Not the sandbox provisioning, which a customer with
 * an account never pays, and not opening the PDF, which the page counts
 * separately.
 */

import { chromium, type Page } from 'playwright';

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:3000';
const RUNS = Number(process.argv[2] ?? 3);
const PHONE = { width: 390, height: 844 };

/** Disclosed, and deliberately unhurried. See the note above. */
const TAP_DELAY_MS = 1000;

let taps = 0;

async function tap(page: Page, locator: ReturnType<Page['locator']>) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.click();
  taps += 1;
  await page.waitForTimeout(TAP_DELAY_MS);
}

/**
 * The first unanswered choice in a group.
 *
 * Selected by `aria-pressed="false"` rather than by role, which is how the
 * demo capture does it. Taking the first button instead picked up controls
 * that are not chips and left groups unanswered, so `canDraft` stayed false
 * and the draft button sat disabled for two minutes.
 */
async function preferredChoice(group: ReturnType<Page['locator']>) {
  const first = group.locator('[aria-pressed="false"]').first();
  return (await first.count()) ? first : null;
}

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

async function once(): Promise<{ seconds: number; taps: number; draft: number }> {
  taps = 0;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: PHONE, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(120_000);

  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /try it yourself/i }).first().click();
    await page.waitForURL((u) => !/\/(login|signup)/.test(u.pathname), { timeout: 180_000 });
    const start = page.getByRole('link', { name: /start .* note/i });
    await start.waitFor({ timeout: 180_000 });

    // Clock starts here: the roster is on screen and the note has not begun.
    const t0 = Date.now();
    await tap(page, start);

    // Wait for the note form to actually be on screen before answering it.
    // Without this, answerEverything ran against the roster mid-navigation,
    // found no chip groups, tapped nothing and returned instantly -- and then
    // sat for two minutes on a draft button that was correctly disabled,
    // because nothing had been selected.
    await page.locator('[role="group"]').first().waitFor({ timeout: 120_000 });

    await answerEverything(page);

    // The service plan: one outcome worked on, the rest not this shift. This is
    // the "two service-plan goals" the page's tap count is scoped to.
    const worked = page.getByRole('button', { name: /worked on this/i });
    if (await worked.count()) {
      await tap(page, worked.first());
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

    const draftStart = Date.now();
    await tap(page, page.getByRole('button', { name: /write from my entries/i }));
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll('textarea')).some(
          (t) => /describe the shift/i.test(t.placeholder ?? '') && t.value.trim().length > 0
        ),
      undefined,
      { timeout: 180_000 }
    );
    await page.getByRole('button', { name: /write from my entries/i }).waitFor({ timeout: 180_000 });
    const draft = (Date.now() - draftStart) / 1000;

    await tap(page, page.getByRole('button', { name: /^type$/i }));
    const field = page.getByPlaceholder(/type your (full )?name/i).first();
    await field.waitFor({ timeout: 30_000 });
    await field.fill('Robin Vance');
    await page.waitForTimeout(TAP_DELAY_MS);

    await tap(page, page.getByRole('checkbox').last());
    await tap(page, page.getByRole('button', { name: /sign and lock note/i }));
    await page.getByRole('link', { name: /open the pdf to print/i }).waitFor({ timeout: 180_000 });

    return { seconds: (Date.now() - t0) / 1000, taps, draft };
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log(`\nTiming ${RUNS} note(s) against ${BASE}`);
  console.log(`One tap per ${TAP_DELAY_MS / 1000}s, roster to signed and locked, PDF not opened.\n`);

  const rows: Array<{ seconds: number; taps: number; draft: number }> = [];
  for (let i = 0; i < RUNS; i += 1) {
    const r = await once();
    rows.push(r);
    console.log(
      `  run ${i + 1}:  ${r.seconds.toFixed(1)}s total   ${r.taps} taps   ${r.draft.toFixed(1)}s of that waiting for the draft`
    );
  }

  const secs = rows.map((r) => r.seconds).sort((a, b) => a - b);
  const tapCounts = [...new Set(rows.map((r) => r.taps))];
  console.log(
    `\n  ${secs[0].toFixed(0)}-${secs[secs.length - 1].toFixed(0)}s, taps: ${tapCounts.join('/')}` +
      `, tapping accounts for ${(rows[0].taps * TAP_DELAY_MS) / 1000}s of it\n`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
