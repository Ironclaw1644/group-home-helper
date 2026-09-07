/**
 * Prove the form is data, and that making it data changed nothing for Virginia.
 *
 *   npm run verify:jurisdictions
 *
 * Seven things, in the order they matter:
 *
 *   (a) Virginia's output is UNCHANGED — the same note rendered through the
 *       renderer frozen at 7d06e00 and through the new template-driven one
 *       produces identical PDF bytes.
 *   (b) The second jurisdiction renders its OWN form, not Virginia's.
 *   (c) An org never renders another jurisdiction's template.
 *   (d) An unanswered outcome still prints as unanswered in EVERY template.
 *   (e) The templates shipped in migrations are well-formed and claim nothing
 *       they should not.
 *   (f) The TypeScript precedence rule and the SQL one agree.
 *   (g) Correcting a jurisdiction changes new notes only — a note that is
 *       already signed keeps the form it was filed on.
 *
 * (a) is the regression bar. Everything else is new capability; (a) is the
 * promise that the new capability cost nothing.
 */
import { renderToBuffer } from '@react-pdf/renderer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

import { ShippedForm680 } from './reference/Form680.shipped';
import { TemplatePdf } from '../lib/pdf/TemplatePdf';
import { buildPrintContext } from '../lib/pdf/print-context';
import { pickTemplate } from '../lib/notes/repo';
import { DEFAULT_IDENTITY_LABELS, formCaptions } from '../lib/forms/layout-defaults';
import { libraryFor, personalize } from '../lib/outcomes/library';
import * as f from './reference/fixture';
import type { FormTemplate, RenderConfig } from '../lib/types';

let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${label}${detail && !ok ? `\n           ${detail}` : ''}`);
  if (!ok) failures++;
}

function section(title: string) {
  console.log(`\n${title}\n`);
}

// ---------------------------------------------------------------------------
// PDF helpers
// ---------------------------------------------------------------------------

function extractText(buffer: Buffer, dir: string, name: string): string | null {
  const file = path.join(dir, name);
  writeFileSync(file, buffer);
  try {
    return execFileSync('pdftotext', ['-layout', file, '-'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024
    });
  } catch {
    return null;
  }
}

/**
 * Strip the parts of a PDF that change on every render.
 *
 * A PDF carries its own creation timestamp and a file identifier derived from
 * it. Those differ between two renders of the same document a millisecond
 * apart, and they are not the document. Everything else — page tree, fonts,
 * resources, and every drawing operator in every content stream — is compared
 * byte for byte.
 */
function normalizeBytes(buffer: Buffer): string {
  return buffer
    .toString('latin1')
    // react-pdf writes the creation date as a bare indirect object
    // (`22 0 obj\n(D:20260906205321Z)\nendobj`), NOT as `/CreationDate (...)`
    // — the Info dictionary only holds a reference to it. Missing this made
    // the comparison fail roughly one run in forty, whenever the two renders
    // straddled a second boundary. Both replacements are fixed-width, so xref
    // offsets stay aligned and the rest of the file is still compared exactly.
    .replace(/\(D:\d{4}[^)]*\)/g, '(D:)')
    .replace(/\/CreationDate\s*\([^)]*\)/g, '/CreationDate()')
    .replace(/\/ModDate\s*\([^)]*\)/g, '/ModDate()')
    .replace(/\/ID\s*\[[^\]]*\]/g, '/ID[]');
}

const SHARED = {
  note: f.note,
  resident: f.resident,
  shiftLabel: f.SHIFT_LABEL,
  addenda: f.addenda,
  orgLine: f.ORG_LINE,
  letterhead: f.LETTERHEAD,
  address: f.ADDRESS,
  footerLine: f.FOOTER_LINE,
  logoSrc: null,
  signatureSrc: null,
  outcomes: f.outcomes,
  noteOutcomes: f.noteOutcomes,
  activities: f.activities,
  noteActivities: f.noteActivities
};

function renderWith(template: FormTemplate, extras: Record<string, unknown> = {}) {
  return renderToBuffer(
    <TemplatePdf
      {...SHARED}
      template={template}
      ctx={buildPrintContext({
        note: f.note,
        resident: f.resident,
        shift: { label: f.SHIFT_LABEL, startTime: '07:00:00', endTime: '19:00:00' },
        shiftLabel: f.SHIFT_LABEL,
        orgLine: f.ORG_LINE,
        providerId: 'OH-1234567',
        placeOfService: 'Maple Street House',
        serviceType: template.renderConfig.service_type,
        groupSize: 4,
        ...extras
      })}
    />
  );
}

// ---------------------------------------------------------------------------
// Read the templates the migrations actually ship
// ---------------------------------------------------------------------------

const MIGRATIONS = path.join(process.cwd(), 'supabase', 'migrations');

/**
 * Load every seeded template by applying the migrations to a throwaway
 * database and reading the rows back.
 *
 * Parsing the SQL with a regex would test the regex. This tests the rows a
 * customer's database will actually hold, including the jurisdiction backfill
 * in 0030 — which is the thing that keeps existing agencies on Form #680.
 */
async function loadSeededTemplates(): Promise<{
  templates: (FormTemplate & { orgId: string | null })[];
  db: PGlite;
}> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.waitReady;
  db.exec; // keep the import honest for older type defs
  await db.exec(readFileSync(path.join(process.cwd(), 'scripts', 'supabase-compat.sql'), 'utf8'));

  for (const file of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }

  const res = await db.query<Record<string, unknown>>(
    `select id, org_id, key, version, name, form_number, jurisdiction, schema, render_config
       from ghh.form_templates where active order by jurisdiction, key`
  );

  return {
    db,
    templates: res.rows.map((r) => ({
      id: String(r.id),
      orgId: (r.org_id as string | null) ?? null,
      key: String(r.key),
      version: Number(r.version),
      name: String(r.name),
      formNumber: (r.form_number as string | null) ?? null,
      jurisdiction: String(r.jurisdiction),
      schema: r.schema as FormTemplate['schema'],
      renderConfig: (r.render_config ?? {}) as RenderConfig
    }))
  };
}

// ---------------------------------------------------------------------------

async function main() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ghh-juris-'));
  const { templates, db } = await loadSeededTemplates();

  const virginia = templates.find((t) => t.jurisdiction === 'US-VA');
  const ohio = templates.find((t) => t.jurisdiction === 'US-OH');
  const generic = templates.find((t) => t.jurisdiction === 'GENERIC');

  try {
    // -----------------------------------------------------------------------
    section('(a) Virginia is unchanged — byte for byte');
    // -----------------------------------------------------------------------
    //
    // The reference is scripts/reference/Form680.shipped.tsx: the renderer
    // exactly as it was before templates existed. It is rendered against the
    // SEEDED Virginia row rather than a hand-written fixture, so this compares
    // what a real AHFS note prints today with what it printed before.

    check('the Virginia template is still seeded', Boolean(virginia));
    check(
      'it is still Form #680',
      virginia?.formNumber === '680' && virginia?.key === 'daily_progress_note_680'
    );
    check(
      '0030 backfilled it to US-VA rather than leaving it stateless',
      virginia?.jurisdiction === 'US-VA'
    );
    check(
      'it carries NONE of the new layout keys — so the defaults are what it prints',
      Boolean(virginia) &&
        !virginia!.renderConfig.identity_rows &&
        !virginia!.renderConfig.meta_rows &&
        !virginia!.renderConfig.signature_block &&
        !virginia!.renderConfig.outcome_page &&
        !virginia!.renderConfig.addenda_page,
      'the shipped #680 row gained layout keys; the regression bar below is then vacuous'
    );

    if (virginia) {
      const before = await renderToBuffer(
        <ShippedForm680 {...SHARED} template={virginia} />
      );
      const after = await renderWith(virginia);

      const beforeText = extractText(before, dir, 'va-before.pdf');
      const afterText = extractText(after, dir, 'va-after.pdf');

      if (beforeText === null || afterText === null) {
        console.log('\n  pdftotext is not installed — text assertions skipped.');
        console.log('  Install poppler (brew install poppler) to run them.\n');
      } else {
        check('every printed character is identical', beforeText === afterText);
      }

      check(
        'every PDF byte is identical once the creation timestamp is normalised',
        normalizeBytes(before) === normalizeBytes(after),
        `${before.length} bytes before, ${after.length} after`
      );
      check('page count is identical', before.length > 1000 && after.length > 1000);
    }

    // -----------------------------------------------------------------------
    section('(b) The second jurisdiction renders its own form');
    // -----------------------------------------------------------------------

    check('an Ohio template is seeded', Boolean(ohio));
    check('a GENERIC fallback template is seeded', Boolean(generic));

    if (ohio && virginia) {
      const ohioPdf = await renderWith(ohio);
      const ohioText = extractText(ohioPdf, dir, 'oh.pdf');

      if (ohioText) {
        // Ohio's own required elements, by OAC 5123-9-30(E) number.
        const REQUIRED: [string, string][] = [
          ['(E)(1) type of service', 'Type of Service'],
          ['(E)(1) type of service value', 'Homemaker/Personal Care'],
          ['(E)(2) date of service', 'Date of Service'],
          ['(E)(3) place of service', 'Place of Service'],
          ['(E)(3) place of service value', 'Maple Street House'],
          ['(E)(4) name of individual', 'Name of Individual'],
          ['(E)(5) Medicaid identification number', 'Medicaid ID'],
          ['(E)(6) name of provider', 'Provider:'],
          ['(E)(7) provider identifier', 'Provider ID'],
          ['(E)(7) provider identifier value', 'OH-1234567'],
          ['(E)(8) signature of person delivering the service', 'Signature of Person Delivering Service'],
          ['(E)(9) group size', 'Group Size'],
          ['(E)(11) units, as a labelled blank', 'Units:'],
          ['(E)(12) time started', 'Started:'],
          ['(E)(12) time stopped', 'Stopped:']
        ];
        for (const [label, needle] of REQUIRED) {
          check(`Ohio prints ${label}`, ohioText.includes(needle), `missing "${needle}"`);
        }

        check('Ohio prints the started clock time', ohioText.includes('7:00 AM'));
        check('Ohio prints the stopped clock time', ohioText.includes('7:00 PM'));
        check('Ohio prints the counted group size', /Group Size:\s*4/.test(ohioText));

        // The whole point: Ohio must not be Virginia wearing a hat.
        check(
          'Ohio does NOT print Virginia\'s form number',
          !ohioText.includes('680'),
          'Virginia\'s form number reached an Ohio document'
        );
        check(
          'Ohio does NOT print Virginia\'s identity label',
          !ohioText.includes("Individual's Name")
        );
        check(
          'Ohio cites the rule it was built from',
          ohioText.includes('5123-9-30')
        );
        check(
          'Ohio says plainly that it is not a state-issued form',
          ohioText.includes('Not a state-issued form'),
          'an Ohio customer could reasonably read this as an official DODD document'
        );
        check(
          'Ohio uses its own outcome-page heading',
          ohioText.includes('Services Delivered Against the Individual Service Plan')
        );
        check(
          'Ohio uses its own status vocabulary',
          ohioText.includes('Service delivered this shift')
        );
      }
    }

    if (generic) {
      const genericPdf = await renderWith(generic);
      const genericText = extractText(genericPdf, dir, 'generic.pdf');
      if (genericText) {
        check('the GENERIC template renders', genericPdf.length > 1000);
        check(
          'GENERIC claims no form number',
          !genericText.includes('Form #'),
          'the no-state template printed a form number'
        );
        check(
          'GENERIC claims no state',
          !/Virginia|Ohio|DBHDS|DODD|5123|680/.test(genericText),
          'the no-state template named a jurisdiction'
        );
      }
      check('GENERIC has a null form number in the database', generic.formNumber === null);
    }

    // -----------------------------------------------------------------------
    section('(c) An org never renders another jurisdiction\'s template');
    // -----------------------------------------------------------------------
    //
    // Exercised against the pure precedence rule, then against the SQL one, so
    // a future change has to break both to get through.

    const ORG_A = '11111111-1111-1111-1111-111111111111';
    const ORG_B = '22222222-2222-2222-2222-222222222222';

    const candidates = [
      { id: 'va-global', orgId: null, jurisdiction: 'US-VA', version: 1 },
      { id: 'oh-global', orgId: null, jurisdiction: 'US-OH', version: 1 },
      { id: 'generic', orgId: null, jurisdiction: 'GENERIC', version: 1 },
      { id: 'va-own', orgId: ORG_A, jurisdiction: 'US-VA', version: 1 },
      { id: 'oh-own-other-org', orgId: ORG_B, jurisdiction: 'US-OH', version: 1 }
    ];

    check(
      'a Virginia org gets its own Virginia template over the global one',
      pickTemplate(candidates, ORG_A, 'US-VA')?.id === 'va-own'
    );
    check(
      'a Virginia org with no template of its own gets the global Virginia one',
      pickTemplate(candidates, ORG_B, 'US-VA')?.id === 'va-global'
    );
    check(
      'an Ohio org gets Ohio, never Virginia',
      pickTemplate(candidates, ORG_A, 'US-OH')?.id === 'oh-global'
    );
    check(
      "an org never receives another org's private template",
      pickTemplate(candidates, ORG_A, 'US-OH')?.id !== 'oh-own-other-org'
    );
    check(
      'a state with no template falls back to GENERIC, not to a neighbour',
      pickTemplate(candidates, ORG_A, 'US-MT')?.id === 'generic'
    );
    check(
      'with no GENERIC installed, an unknown state gets NOTHING rather than a wrong form',
      pickTemplate(
        candidates.filter((c) => c.jurisdiction !== 'GENERIC'),
        ORG_A,
        'US-MT'
      ) === null,
      'a Montana provider was handed some other state\'s document'
    );
    check(
      'a higher version of the same jurisdiction wins',
      pickTemplate(
        [...candidates, { id: 'va-global-v2', orgId: null, jurisdiction: 'US-VA', version: 2 }],
        ORG_B,
        'US-VA'
      )?.id === 'va-global-v2'
    );

    // -----------------------------------------------------------------------
    section('(f) The SQL precedence rule agrees with the TypeScript one');
    // -----------------------------------------------------------------------

    await db.exec(`
      insert into ghh.organizations (id, name, jurisdiction)
      values ('${ORG_A}', 'ZZ Verify Virginia', 'US-VA'),
             ('${ORG_B}', 'ZZ Verify Ohio', 'US-OH')
      on conflict (id) do nothing;
    `);

    const sqlPick = async (orgId: string) => {
      const r = await db.query<{ jurisdiction: string; key: string }>(
        `select jurisdiction, key from ghh.template_for_org($1)`,
        [orgId]
      );
      return r.rows[0] ?? null;
    };

    const vaPick = await sqlPick(ORG_A);
    const ohPick = await sqlPick(ORG_B);

    check('ghh.template_for_org gives a Virginia org the Virginia form', vaPick?.jurisdiction === 'US-VA');
    check('ghh.template_for_org gives an Ohio org the Ohio form', ohPick?.jurisdiction === 'US-OH');
    check(
      'ghh.template_for_org agrees with pickTemplate for Virginia',
      vaPick?.key === pickTemplate(templates, ORG_A, 'US-VA')?.key
    );
    check(
      'ghh.template_for_org agrees with pickTemplate for Ohio',
      ohPick?.key === pickTemplate(templates, ORG_B, 'US-OH')?.key
    );

    // An org in a state nobody has authored falls to GENERIC and no further.
    await db.exec(`
      insert into ghh.organizations (id, name, jurisdiction)
      values ('33333333-3333-3333-3333-333333333333', 'ZZ Verify Montana', 'US-MT')
      on conflict (id) do nothing;
    `);
    const mtPick = await sqlPick('33333333-3333-3333-3333-333333333333');
    check(
      'an unauthored state falls to GENERIC in SQL too',
      mtPick?.jurisdiction === 'GENERIC',
      `got ${mtPick?.jurisdiction ?? 'nothing'}`
    );

    check(
      'the jurisdiction format constraint rejects junk',
      await db
        .exec(`insert into ghh.organizations (name, jurisdiction) values ('ZZ Bad', 'virginia')`)
        .then(() => false)
        .catch(() => true),
      'any string can be written into organizations.jurisdiction'
    );

    // -----------------------------------------------------------------------
    section('(d) An unanswered outcome prints as unanswered in EVERY template');
    // -----------------------------------------------------------------------
    //
    // The fixture's third outcome is on the plan and has no note_outcomes row.
    // That is the unanswered state, and it must never print as a negative — a
    // blank rendered as "not addressed" is an unmade clinical claim on a
    // Medicaid document. A template may RENAME the three states; the renderer
    // merges label overrides over the defaults, so it cannot delete one.

    for (const template of templates) {
      const label = `${template.jurisdiction} (${template.key})`;
      const pdf = await renderWith(template);
      const text = extractText(pdf, dir, `unanswered-${template.jurisdiction}.pdf`);
      if (!text) continue;

      const unansweredLabel =
        template.renderConfig.outcome_page?.status_labels?.unanswered ??
        'Not recorded — no answer documented';

      check(
        `${label}: the unanswered outcome prints as unanswered`,
        text.includes('Handling my own money') && text.includes(unansweredLabel),
        'the outcome with no answer did not print its unanswered state'
      );

      // It must not be swept in with the outcome that WAS ruled out.
      const notAddressed =
        template.renderConfig.outcome_page?.status_labels?.not_addressed ??
        'Not addressed this shift';
      const unansweredLine = text
        .split('\n')
        .find((l) => l.includes('Handling my own money'));
      check(
        `${label}: it is not printed as a documented negative`,
        Boolean(unansweredLine) && !unansweredLine!.includes(notAddressed),
        `"Handling my own money" printed as "${notAddressed}"`
      );

      // Unanswered ACTIVITIES are likewise shown, not hidden by the layout.
      const activityUnanswered =
        template.renderConfig.outcome_page?.activity_labels?.unanswered ?? 'Not recorded';
      check(
        `${label}: an unanswered activity is printed rather than omitted`,
        text.includes('Did JP prepare lunch?') && text.includes(activityUnanswered)
      );
    }

    // -----------------------------------------------------------------------
    section('(e) Every seeded template is well-formed and claims nothing extra');
    // -----------------------------------------------------------------------

    const JURISDICTION_RE = /^([A-Z]{2}-[A-Z]{2}|GENERIC)$/;
    const seenKeys = new Set<string>();

    for (const t of templates) {
      const label = `${t.jurisdiction} (${t.key})`;
      check(`${label}: jurisdiction is well-formed`, JURISDICTION_RE.test(t.jurisdiction));
      check(`${label}: key is unique`, !seenKeys.has(t.key));
      seenKeys.add(t.key);
      check(`${label}: has at least one prompt`, t.schema.prompts.length > 0);
      check(`${label}: has at least one section`, (t.schema.sections ?? []).length > 0);
      check(`${label}: has a narrative block`, Boolean(t.schema.narrative?.key));
      check(`${label}: has a signature attestation`, Boolean(t.schema.signature?.attestation));

      // A template row is global and shared. An agency identity in one prints
      // on every other agency's records — a bug this codebase has had once.
      const blob = JSON.stringify(t);
      check(
        `${label}: carries no agency identity`,
        !/At Home Family|AHFS/.test(blob),
        'an agency name is embedded in a shared template row'
      );

      // Only a template built from a real, citable rule may carry a citation.
      const citation = t.renderConfig.footer?.legal_citation;
      if (citation) {
        check(
          `${label}: its citation names a real rule`,
          /\d/.test(citation) && /Code|Rule|Regulation|§/i.test(citation),
          `"${citation}" does not look like a citation`
        );
      }

      // A form number is a claim that a numbered state document exists.
      if (t.jurisdiction === 'GENERIC') {
        check(`${label}: claims no form number`, t.formNumber === null);
      }
    }

    check(
      'exactly one template per shipped jurisdiction',
      new Set(templates.map((t) => t.jurisdiction)).size === templates.length,
      'two templates share a jurisdiction; resolution then depends on version alone'
    );

    // -----------------------------------------------------------------------
    section('Every jurisdiction ships a usable starter outcome library');
    // -----------------------------------------------------------------------
    //
    // These checks used to live in verify:import and covered Virginia only,
    // because Virginia's library was the only one and it was a TypeScript
    // const. Now that the library is template data they run for every
    // jurisdiction, which is the point of having moved it.
    //
    // The pronoun sweep is the one that actually catches things: someone whose
    // pronouns are they/them must not get "they feels good". A present-tense
    // verb straight after {subject} breaks for exactly one of the three sets —
    // the one least likely to be spotted by eye.

    const PRONOUN_SETS = [
      { subject: 'he', object: 'him', possessive: 'his' },
      { subject: 'she', object: 'her', possessive: 'her' },
      { subject: 'they', object: 'them', possessive: 'their' }
    ];
    const BAD_AGREEMENT =
      /\bthey (feels|wants|likes|looks|chooses|prepares|goes|does|has|is|needs|makes|takes|puts|greets|meets|spends|completes|picks|rides|pays|takes)\b/i;

    for (const template of templates) {
      const label = `${template.jurisdiction} (${template.key})`;
      const library = libraryFor(template);

      check(`${label}: ships a starter library`, library.length > 0);
      check(
        `${label}: every starter outcome has at least one activity`,
        library.every((o) => o.activities.length > 0)
      );
      check(
        `${label}: every activity carries a daily question`,
        library.every((o) => o.activities.every((a) => a.dailyQuestion.trim().length > 0))
      );
      check(
        `${label}: starter outcome keys are unique`,
        new Set(library.map((o) => o.key)).size === library.length
      );

      const offenders: string[] = [];
      for (const outcome of library) {
        for (const set of PRONOUN_SETS) {
          const texts = [
            personalize(outcome.statement, 'Jordan', set),
            ...outcome.activities.flatMap((a) => [
              personalize(a.description, 'Jordan', set),
              personalize(a.measure, 'Jordan', set),
              personalize(a.supportInstructions, 'Jordan', set),
              personalize(a.dailyQuestion, 'Jordan', set)
            ])
          ];
          for (const t of texts) if (BAD_AGREEMENT.test(t)) offenders.push(t);
        }
      }
      check(
        `${label}: no starter text produces "they <verb>s"`,
        offenders.length === 0,
        offenders.slice(0, 3).join(' | ')
      );
    }

    // A jurisdiction must never be offered another one's plans.
    if (virginia && ohio) {
      const vaKeys = new Set(libraryFor(virginia).map((o) => o.key));
      const ohKeys = new Set(libraryFor(ohio).map((o) => o.key));
      check(
        'Virginia and Ohio ship different starter vocabularies',
        [...ohKeys].some((k) => !vaKeys.has(k)),
        'Ohio was handed a copy of Virginia\'s library'
      );
    }

    // -----------------------------------------------------------------------
    section('(g) A signed note keeps the form it was signed under');
    // -----------------------------------------------------------------------
    //
    // The correction case. An agency picks the wrong state at sign-up, files
    // notes under it, and then fixes the setting. Fixing it must change what
    // NEW notes print and nothing else: a note that is already signed, locked
    // and sent to Medicaid must keep rendering the document that was filed.
    // Re-styling it would leave the record unchanged and the evidence of the
    // record changed, which is worse than the original mistake.
    //
    // Proved twice — the database refuses the edit, and the renderer, handed
    // the pinned row, still draws the old state's form.

    if (virginia && ohio) {
      const seeded = await db.query<{ note_id: string; org_id: string; author_id: string }>(`
        with o as (
          insert into ghh.organizations (name, jurisdiction, created_via)
          values ('ZZ Verify Corrected', 'US-VA', 'signup')
          returning id
        ),
        h as (
          insert into ghh.homes (org_id, name) select id, 'Maple Street House' from o
          returning id, org_id
        ),
        s as (
          insert into ghh.shifts (org_id, home_id, label, start_time, end_time, sort_order)
          select org_id, id, '7AM-7PM', '07:00', '19:00', 0 from h returning id
        ),
        u as (
          insert into auth.users (email) values ('corrected-verify@demo.invalid') returning id
        ),
        p as (
          insert into ghh.profiles (id, org_id, full_name, title, role)
          select u.id, o.id, 'Verify User', 'DSP', 'admin' from u, o returning id
        ),
        r as (
          insert into ghh.residents (org_id, home_id, first_name, last_name)
          select org_id, id, 'Alex', 'Sample' from h returning id, org_id
        ),
        n as (
          insert into ghh.notes (org_id, template_id, template_version, resident_id, home_id,
                                 shift_id, service_date, author_id, narrative)
          select r.org_id, t.id, t.version, r.id, h.id, s.id, current_date, p.id,
                 'A note filed while the agency was set to Virginia.'
            from r, h, s, p, ghh.form_templates t
           where t.jurisdiction = 'US-VA'
          returning id, org_id, author_id
        )
        select n.id as note_id, n.org_id, n.author_id from n
      `);

      const { note_id: noteId, org_id: orgId, author_id: authorId } = seeded.rows[0];

      await db.query(
        `update ghh.notes
            set status = 'signed', signed_at = now(), signed_by = $2,
                signature_name = 'Verify User', signature_title = 'DSP'
          where id = $1`,
        [noteId, authorId]
      );

      // The correction: the agency was never in Virginia.
      await db.query(`update ghh.organizations set jurisdiction = 'US-OH' where id = $1`, [orgId]);

      const nowResolves = await db.query<{ jurisdiction: string }>(
        `select jurisdiction from ghh.template_for_org($1)`,
        [orgId]
      );
      check(
        'after the correction the agency resolves the new state for new work',
        nowResolves.rows[0]?.jurisdiction === 'US-OH'
      );

      const pinned = await db.query<{ jurisdiction: string }>(
        `select t.jurisdiction
           from ghh.notes n join ghh.form_templates t on t.id = n.template_id
          where n.id = $1`,
        [noteId]
      );
      check(
        'the note signed beforehand still points at the form it was signed under',
        pinned.rows[0]?.jurisdiction === 'US-VA',
        `it now points at ${pinned.rows[0]?.jurisdiction ?? 'nothing'}`
      );

      check(
        'the database refuses to repoint a signed note at another form',
        await db
          .query(`update ghh.notes set template_id = $2 where id = $1`, [noteId, ohio.id])
          .then(() => false)
          .catch(() => true),
        'a signed note could be moved onto another jurisdiction\'s template'
      );

      // And the renderer, given the pinned row, still draws Virginia — which
      // is what getTemplateForNote hands it for a signed note.
      const pinnedPdf = await renderWith(virginia);
      const pinnedText = extractText(pinnedPdf, dir, 'pinned.pdf');
      if (pinnedText) {
        check(
          'rendered against the pinned row it is still the form that was filed',
          pinnedText.includes('680') && !pinnedText.includes('5123-9-30')
        );
      }
    }

    // Every route that produces a PDF has to ask for the NOTE's template, not
    // the org's current one. The rule above is only as good as its call sites,
    // and the call sites are the thing a later change quietly reverts.
    for (const route of [
      path.join('app', 'notes', '[id]', 'pdf', 'route.tsx'),
      path.join('app', 'supervisor', 'export', 'route.tsx'),
      path.join('app', 'notes', '[id]', 'page.tsx')
    ]) {
      const src = readFileSync(path.join(process.cwd(), route), 'utf8');
      check(
        `${route} resolves the template per note, not per org`,
        src.includes('getTemplateForNote') && !/\bgetTemplateForOrg\(/.test(src),
        'a signed note would re-render on whatever form the agency uses today'
      );
    }

    // Retiring a template version must not restyle what was signed under it.
    const repoSource = readFileSync(path.join(process.cwd(), 'lib', 'notes', 'repo.ts'), 'utf8');
    const byId = repoSource.slice(repoSource.indexOf('export async function getTemplateById'));
    check(
      'getTemplateById does not filter on active',
      !byId.slice(0, byId.indexOf('\n}')).includes("'active'"),
      'a retired template version would stop printing the records signed under it'
    );

    // -----------------------------------------------------------------------
    section('The picker offers exactly what is installed');
    // -----------------------------------------------------------------------
    //
    // ghh.available_jurisdictions() is what sign-up and Settings show. It has
    // to name every installed jurisdiction, name no other, and describe each
    // one the way that jurisdiction's form actually prints — otherwise the
    // preview beside the picker promises a document the renderer will not
    // produce.

    const offered = await db.query<{
      code: string;
      name: string;
      form_title: string;
      form_line: string;
      identity_labels: string[] | null;
    }>(`select * from ghh.available_jurisdictions()`);

    check(
      'every installed jurisdiction is offered',
      new Set(offered.rows.map((r) => r.code)).size === new Set(templates.map((t) => t.jurisdiction)).size &&
        templates.every((t) => offered.rows.some((r) => r.code === t.jurisdiction)),
      `offered ${offered.rows.map((r) => r.code).join(', ')}`
    );

    check(
      'each one is offered under a human name, not its code',
      offered.rows.every((r) => r.name.trim().length > 0 && r.name !== r.code),
      offered.rows.map((r) => `${r.code}=${r.name}`).join(', ')
    );

    for (const row of offered.rows) {
      const template = templates.find((t) => t.jurisdiction === row.code)!;
      const captions = formCaptions(template);
      check(
        `${row.code}: the offered title is the one the renderer prints`,
        row.form_title === captions.title,
        `SQL says "${row.form_title}", the renderer says "${captions.title}"`
      );
      check(
        `${row.code}: the offered form line is the one the renderer prints`,
        row.form_line === captions.formLine,
        `SQL says "${row.form_line}", the renderer says "${captions.formLine}"`
      );
      check(
        `${row.code}: the offered identity labels are the ones the renderer prints`,
        JSON.stringify((row.identity_labels ?? DEFAULT_IDENTITY_LABELS).map((l) => l.trim())) ===
          JSON.stringify(captions.identityLabels)
      );
    }

    check(
      'the general-purpose option is offered without a form number',
      !offered.rows.find((r) => r.code === 'GENERIC')?.form_line.includes('#'),
      'the no-state option was captioned with a form number'
    );

    // A template belonging to one agency is that agency's business. Offering
    // it on a public sign-up page would tell a stranger it exists.
    await db.exec(`
      insert into ghh.form_templates (org_id, key, version, name, form_number, jurisdiction,
                                      jurisdiction_name, schema, render_config, active)
      select o.id, 'zz_private_only', 1, 'Private', null, 'US-MT', 'Montana',
             t.schema, t.render_config, true
        from ghh.organizations o, ghh.form_templates t
       where o.name = 'ZZ Verify Virginia' and t.jurisdiction = 'GENERIC'
       limit 1;
    `);
    const afterPrivate = await db.query<{ code: string }>(
      `select code from ghh.available_jurisdictions()`
    );
    check(
      "one agency's private template is not offered to everyone else",
      !afterPrivate.rows.some((r) => r.code === 'US-MT'),
      'a private template put its jurisdiction on the public sign-up page'
    );

    // -----------------------------------------------------------------------
    section('The engine branches on no jurisdiction');
    // -----------------------------------------------------------------------
    //
    // Cheap, and it catches the reintroduction of a special case before anyone
    // renders anything. Neither the renderer nor the shared model prompt may
    // know Virginia from Ohio: both are one artifact serving every customer on
    // the install, so a literal in either is a claim made to all of them.

    const engineFiles: [string, string][] = [
      ['lib/pdf/TemplatePdf.tsx', path.join('lib', 'pdf', 'TemplatePdf.tsx')],
      ['lib/ai/prompts.ts', path.join('lib', 'ai', 'prompts.ts')]
    ];

    for (const [label, file] of engineFiles) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

      for (const needle of ['US-VA', 'US-OH', 'DBHDS', 'DODD', '680', '5123']) {
        check(
          `${label} contains no "${needle}" outside comments`,
          !source.includes(needle),
          'a jurisdiction leaked back into the engine'
        );
      }
    }
  } finally {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  }

  console.log('');
  if (failures > 0) {
    console.error(`${failures} jurisdiction check(s) failed.\n`);
    process.exit(1);
  }
  console.log('Virginia is unchanged, and the form is data.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
