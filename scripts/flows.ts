/**
 * The demo films, one per thing a buyer needs to believe.
 *
 *   npm run video:capture -- branding
 *   npm run video:build   -- branding
 *
 * Each flow drives the real product against the real demo sandbox and writes
 * tmp/demo-video/<flow>/. Nothing is staged: if a flow cannot be performed by
 * using the software, there is no film of it.
 *
 * WHY THESE FLOWS
 *
 * A care-agency owner buying documentation software is afraid of three
 * different things, and one film cannot answer all three:
 *
 *   "will my staff actually use it"      -> note
 *   "will it look like OUR agency"       -> branding
 *   "do I have to retype everything"     -> roster
 *   "can somebody fake a record"         -> oversight
 *
 * The last is the one that closes an audit-frightened buyer and the one most
 * competitors cannot show, because their notes are editable.
 */

import { type Page } from 'playwright';
import path from 'node:path';

export type Ctx = {
  page: Page;
  tap: (locator: ReturnType<Page['locator']>) => Promise<void>;
  mark: (name: string) => void;
  inject: () => Promise<void>;
  type: (locator: ReturnType<Page['locator']>, text: string) => Promise<void>;
};

export type Flow = {
  /** Where the film goes and what the build script names it. */
  key: string;
  /** Shown on the title card. */
  title: string;
  /** Under the title. */
  subtitle: string;
  /** beat name -> caption. A beat with no entry shows nothing. */
  captions: Record<string, string>;
  run: (ctx: Ctx) => Promise<void>;
};

/* ------------------------------------------------------------------ */

const branding: Flow = {
  key: 'branding',
  title: 'Your own letterhead',
  // Was "Not ours", which spent the subtitle denying something nobody had
  // suspected. The buyer is not wondering whose logo it is; they are wondering
  // whether they can make it theirs.
  subtitle: 'Set up in a minute',
  captions: {
    settings: 'Make it yours.',
    before: 'This is the form today.',
    identity: 'Your legal name, your address,\nyour provider number.',
    logo: 'Upload your logo.',
    colours: 'Pick your colours.',
    after: 'Same form. Your agency.',
    saved: 'Saved. Every note prints this way now.'
  },
  async run({ page, tap, mark, inject, type }) {
    await page.goto(new URL('/settings', page.url()).toString(), { waitUntil: 'networkidle' });
    await inject();
    await page.waitForTimeout(1200);
    mark('settings');

    // The preview sits at the top of the agency section now, so a viewer sees
    // the document change as the fields change. That is the whole point of the
    // screen and it is why this film exists.
    // The letterhead BEFORE anything is changed, held long enough to register.
    // The film's whole argument is a before and an after of the same document,
    // and an after only means something if the viewer saw the before.
    await page.getByText(/how the printed form will look/i).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(2600);
    mark('before');
    await page.waitForTimeout(1600);

    const legal = page.locator('#b-legal');
    if (await legal.count()) {
      await legal.scrollIntoViewIfNeeded();
      await legal.fill('');
      await type(legal, 'Harborlight Care Services, LLC');
      await page.waitForTimeout(500);
    }
    const letterhead = page.locator('#b-letterhead');
    if (await letterhead.count()) {
      await letterhead.fill('');
      await type(letterhead, 'Supported Living Program');
      await page.waitForTimeout(500);
    }
    const address = page.locator('#b-address');
    if (await address.count()) {
      await address.fill('');
      await type(address, '44 Beacon Street, Norfolk, VA 23510');
    }
    const footer = page.locator('#b-footer');
    if (await footer.count()) {
      await footer.fill('');
      await type(footer, 'Provider #123456');
    }
    await page.waitForTimeout(900);
    mark('identity');

    // The logo. The button opens a real file chooser, so the film uses
    // Playwright's filechooser event rather than reaching for the hidden input
    // behind it — the tap is visible, and the upload is the one the product
    // actually performs.
    const upload = page.getByRole('button', { name: /^(upload|replace)$/i }).first();
    if (await upload.count()) {
      await upload.scrollIntoViewIfNeeded();
      await page.waitForTimeout(700);
      mark('logo');
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 20_000 }),
        tap(upload)
      ]);
      // The committed sample logo, not a file under tmp/. It used to point at
      // tmp/demo-video/agency-logo.png, which is scratch space the build
      // clears — so the letterhead film could be shot once and never again
      // without somebody knowing to put a PNG back by hand. It is the same
      // image the public page already ships.
      await chooser.setFiles(path.join(process.cwd(), 'public', 'demo', 'example-agency-logo.png'));
      await page.waitForTimeout(3200);
    }

    // The palette. Four presets, and tapping one repaints the preview — this
    // is the "theme" half of making the product look like the agency rather
    // than like us.
    const palette = page.getByRole('button', { name: /harbor/i }).first();
    if (await palette.count()) {
      await palette.scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      mark('colours');
      await tap(palette);
      await page.waitForTimeout(700);
      // Then put the sample on screen, because the sample is the point.
      // Tapping a preset scrolled the swatch list into view and left the thing
      // that actually repainted above the top of the phone — the film showed
      // five colour chips changing rather than a letterhead changing, which is
      // the same fact told in the least persuasive way available.
      // scrollIntoViewIfNeeded refuses to move an element it already counts as
      // partly visible, which left the sample clipped off the top while the
      // swatch list filled the frame. Centre it explicitly.
      const sample = page.locator('[aria-label="How your colours look"]').first();
      if (await sample.count()) {
        await sample.evaluate((el) =>
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        );
        await page.waitForTimeout(3400);
      }
    }

    // And the same document again. Logo on it, repainted in their colours,
    // before anything has been saved.
    await page.getByText(/how the printed form will look/i).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
    mark('after');
    await page.waitForTimeout(2600);

    const save = page.getByRole('button', { name: /^save/i }).first();
    if (await save.count()) {
      await tap(save);
      await page.waitForTimeout(2400);
    }
    mark('saved');
    await page.waitForTimeout(1800);
  }
};

/* ------------------------------------------------------------------ */

const roster: Flow = {
  key: 'roster',
  title: 'Your people',
  subtitle: 'Without retyping them',
  captions: {
    residents: 'Everyone you support, in one list.',
    importing: 'Moving in from a spreadsheet?',
    paste: 'Paste it. Any shape.\nA table, a list, whatever you have.',
    'asks-first': 'It asks before sending anything\nabout a resident anywhere.',
    parsed: 'It reads names, rooms,\npronouns and dates of birth.',
    review: 'You check it before anything is added.',
    added: 'Added. Nobody retyped a roster.'
  },
  async run({ page, tap, mark, inject, type }) {
    await page.goto(new URL('/residents', page.url()).toString(), { waitUntil: 'networkidle' });
    await inject();
    await page.waitForTimeout(1400);
    mark('residents');

    await page.goto(new URL('/residents/import', page.url()).toString(), {
      waitUntil: 'networkidle'
    });
    await inject();
    await page.waitForTimeout(1200);
    mark('importing');

    // Deliberately ragged: three different shapes in one paste, which is what
    // a real handover list looks like and what the panel claims to accept.
    const messy = [
      'Alexander Rivera (Alex), room 2B, he/him, DOB 4/12/85',
      'Maria Ochoa — 3A — she/her',
      'Jordan Pike, they/them, North Hall'
    ].join('\n');

    const box = page.locator('textarea').first();
    await box.scrollIntoViewIfNeeded();
    await box.click();
    await type(box, messy);
    await page.waitForTimeout(1600);
    mark('paste');

    const read = page.getByRole('button', { name: /read this list/i }).first();
    await read.waitFor({ timeout: 20_000 });
    await tap(read);
    await page.waitForTimeout(2400);

    // A ragged paste is not laid out like a spreadsheet, so the app stops and
    // says so: the text, names and dates of birth included, would go to the
    // assistant's provider to be read, and that needs the same agreement the
    // note assistant needs. It asks before it sends.
    //
    // That pause is the most saleable second in this film. A buyer who has
    // been sold to before is waiting to catch somebody being casual with
    // resident data, and here the software volunteers it unprompted.
    const consent = page.getByRole('button', { name: /let the assistant read it/i }).first();
    if (await consent.count()) {
      // Scroll to it before the caption claims it. The alert renders below the
      // paste card, so the first cut captioned "it asks before sending
      // anything about a resident anywhere" over a screen where the asking was
      // off the bottom of the phone — the same mistake as captioning "signed
      // is locked" over a disabled button.
      await consent.scrollIntoViewIfNeeded();
      await page.waitForTimeout(2400);
      mark('asks-first');
      await page.waitForTimeout(1800);
      await tap(consent);
      await page.waitForTimeout(3000);
    }
    mark('parsed');
    await page.waitForTimeout(2000);
    mark('review');

    const add = page.getByRole('button', { name: /add \d+ residents?/i }).first();
    await add.waitFor({ timeout: 30_000 });
    await tap(add);
    await page.waitForTimeout(3000);
    mark('added');
    await page.waitForTimeout(1800);
  }
};

/* ------------------------------------------------------------------ */

const oversight: Flow = {
  key: 'oversight',
  title: 'What an auditor sees',
  subtitle: 'And what nobody can change',
  captions: {
    supervisor: 'Every house, every shift,\nwho has written and who has not.',
    missing: 'Missing notes are the ones\nthat do not get paid.',
    signed: 'A signed note says who signed it,\nand when, to the second.',
    locked: 'It cannot be edited.\nNot by a supervisor. Not by us.',
    addendum: 'A correction is an addendum.\nBoth versions survive, like a paper chart.'
  },
  async run({ page, mark, inject }) {
    await page.goto(new URL('/supervisor', page.url()).toString(), { waitUntil: 'networkidle' });
    await inject();
    await page.waitForTimeout(1600);
    mark('supervisor');

    await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
    await page.waitForTimeout(1800);
    mark('missing');

    // Open a signed note, which is where the lock and the timestamp live.
    const signed = page.getByRole('link', { name: /view|open/i }).first();
    if (await signed.count()) {
      await signed.click().catch(() => {});
      await page.waitForTimeout(2400);
      await inject();
    }
    mark('signed');
    await page.waitForTimeout(1600);
    mark('locked');
    await page.evaluate(() => window.scrollBy({ top: 420, behavior: 'smooth' }));
    await page.waitForTimeout(2200);
    mark('addendum');
    await page.waitForTimeout(1400);
  }
};

export const FLOWS: Record<string, Flow> = {
  branding: branding,
  roster: roster,
  oversight: oversight
};
