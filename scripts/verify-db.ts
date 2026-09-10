/**
 * End-to-end database verification against a throwaway embedded instance.
 *
 *   npm run db:verify
 *
 * This is the proof for the desktop architecture. It applies the real
 * migrations and then checks the properties the app's safety actually rests
 * on — not that queries run, but that they are *prevented* where they should
 * be:
 *
 *   - a DSP cannot read another house's residents or notes
 *   - a signed note cannot be edited or deleted by anyone
 *   - Medicaid IDs round-trip through encryption and are unreadable without
 *     the key
 *   - the RLS identity does not leak between overlapping requests
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ghh-verify-'));
// Set before importing the client, which reads this at module load.
process.env.GHH_DATA_DIR = path.join(TMP, 'db');

// Imported lazily inside main() so the env var above is already in place.
type DbModule = typeof import('../lib/db/client');
let withUser!: DbModule['withUser'];
let withSystem!: DbModule['withSystem'];
let closeDb!: DbModule['closeDb'];

let failures = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

const ORG = '00000000-0000-0000-0000-000000000001';
const HOME_A = '00000000-0000-0000-0000-000000000010';
const PHI_KEY = 'verification-key-not-a-real-secret';

async function main() {
  ({ withUser, withSystem, closeDb } = await import('../lib/db/client'));

  section('Migrations');
  const tables = await withSystem((db) =>
    db.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'ghh' order by table_name`
    )
  );
  const names = tables.map((t) => t.table_name);
  check(
    'all core tables exist',
    ['users', 'organizations', 'homes', 'profiles', 'staff_homes', 'residents', 'shifts', 'form_templates', 'notes', 'note_addenda', 'ai_generations', 'audit_log'].every(
      (t) => names.includes(t)
    ),
    names.join(', ')
  );

  // A template is seeded at all.
  //
  // This used to read `select form_number from ghh.form_templates limit 1` and
  // assert it equalled '680'. Two things were wrong with it. There are now
  // fifty-two global templates rather than one, and the query carried no ORDER
  // BY, so it asserted a property of whichever row Postgres happened to hand
  // back. And the property it asserted is the one migration 0040 exists to
  // retract: there is no Virginia "Form #680", 680 is a section of
  // 12VAC35-105, and a check demanding that number would have failed the day
  // the fix landed if it had ever been reading the right row.
  const templateCount = await withSystem((db) =>
    db.one<{ n: number }>(
      `select count(*)::int as n from ghh.form_templates where org_id is null and active`
    )
  );
  check('global templates seeded', (templateCount?.n ?? 0) > 0, `${templateCount?.n} active`);

  // No active template claims a form number.
  //
  // This is the regression bar for 0040, and it is deliberately absolute. Both
  // states that publish a real document — West Virginia's WV-BMS-IDD-7 and
  // nobody else — carry that document's identity in `render_config.footer
  // .form_line`, not in `form_number`. So any non-null `form_number` on an
  // active row means somebody reintroduced a numbered claim, which is the exact
  // failure that printed an invented form number on Medicaid records for a
  // year. If a state genuinely needs the column, this check is the place to
  // argue it, with the state's own document cited here.
  const numbered = await withSystem((db) =>
    db.query<{ jurisdiction: string; form_number: string }>(
      `select jurisdiction, form_number from ghh.form_templates
        where org_id is null and active and form_number is not null`
    )
  );
  check(
    'no active template carries a form number',
    (numbered?.length ?? 0) === 0,
    numbered?.map((r) => `${r.jurisdiction}=#${r.form_number}`).join(', ') || 'none'
  );

  // Virginia specifically cites the rule instead of naming a form.
  const va = await withSystem((db) =>
    db.one<{ form_number: string | null; render_config: { footer?: { legal_citation?: string } } }>(
      `select form_number, render_config from ghh.form_templates
        where org_id is null and active and jurisdiction = 'US-VA'`
    )
  );
  check('Virginia claims no form number', va !== null && va.form_number === null);
  check(
    'Virginia cites 12VAC35-105-680 as a rule, not a form',
    Boolean(va?.render_config?.footer?.legal_citation?.includes('Not a state-issued form')),
    va?.render_config?.footer?.legal_citation ?? '(none)'
  );

  // The retired v1 is still there, because notes were signed under it.
  const retiredVa = await withSystem((db) =>
    db.one<{ n: number }>(
      `select count(*)::int as n from ghh.form_templates
        where id = '00000000-0000-0000-0000-000000000100' and not active`
    )
  );
  check('the pre-0040 Virginia row is retained for notes signed under it', retiredVa?.n === 1);

  // -------------------------------------------------------------------------
  section('Fixtures');
  // -------------------------------------------------------------------------
  const { homeB, dspA, dspB, residentA, residentB, shift } = await withSystem(async (db) => {
    const homeB = (await db.one<{ id: string }>(
      `insert into ghh.homes (org_id, name) values ($1, 'Second House') returning id`,
      [ORG]
    ))!.id;

    const mk = async (email: string, role: string) => {
      const u = (await db.one<{ id: string }>(
        `insert into ghh.users (email, password_hash) values ($1, 'x') returning id`,
        [email]
      ))!.id;
      await db.query(
        `insert into ghh.profiles (id, org_id, full_name, title, role) values ($1, $2, $3, 'DSP', $4)`,
        [u, ORG, email, role]
      );
      return u;
    };

    const dspA = await mk('a@example.com', 'dsp');
    const dspB = await mk('b@example.com', 'dsp');

    await db.query(`insert into ghh.staff_homes (profile_id, home_id) values ($1, $2)`, [dspA, HOME_A]);
    await db.query(`insert into ghh.staff_homes (profile_id, home_id) values ($1, $2)`, [dspB, homeB]);

    const mkResident = async (home: string, first: string) =>
      (await db.one<{ id: string }>(
        `insert into ghh.residents (org_id, home_id, first_name, last_name)
         values ($1, $2, $3, 'Test') returning id`,
        [ORG, home, first]
      ))!.id;

    const residentA = await mkResident(HOME_A, 'Ann');
    const residentB = await mkResident(homeB, 'Ben');

    // Encrypt a Medicaid ID the same way the app does.
    await db.query(`select ghh.write_medicaid_id($1, $2, $3)`, [residentA, '109016522050', PHI_KEY]);

    const shift = (await db.one<{ id: string }>(
      `select id from ghh.shifts where home_id = $1 order by sort_order limit 1`,
      [HOME_A]
    ))!.id;

    return { homeB, dspA, dspB, residentA, residentB, shift };
  });
  check('fixtures created', Boolean(homeB && dspA && dspB && residentA && residentB && shift));

  // -------------------------------------------------------------------------
  section('RLS — house isolation');
  // -------------------------------------------------------------------------
  // Main House also holds the seeded demo resident ("Alex Sample"), so a DSP
  // assigned there sees Ann plus Alex. What matters is that neither DSP ever
  // sees the other house's resident.
  const HOME_A_EXPECTED = ['Alex', 'Ann'];
  const HOME_B_EXPECTED = ['Ben'];

  const namesFor = async (userId: string) => {
    const rows = await withUser(userId, (db) =>
      db.query<{ first_name: string }>('select first_name from ghh.residents order by first_name')
    );
    return rows.map((r) => r.first_name);
  };

  const seenByA = await namesFor(dspA);
  check(
    'a DSP sees exactly their own house’s residents',
    JSON.stringify(seenByA) === JSON.stringify(HOME_A_EXPECTED),
    JSON.stringify(seenByA)
  );
  check('...and never the other house’s resident', !seenByA.includes('Ben'));

  const seenByB = await namesFor(dspB);
  check(
    'the other DSP sees exactly theirs',
    JSON.stringify(seenByB) === JSON.stringify(HOME_B_EXPECTED),
    JSON.stringify(seenByB)
  );
  check(
    '...and never the first house’s residents',
    !seenByB.includes('Ann') && !seenByB.includes('Alex')
  );

  const targeted = await withUser(dspA, (db) =>
    db.query('select id from ghh.residents where id = $1', [residentB])
  );
  check('naming another house’s resident directly returns nothing', targeted.length === 0);

  // A DSP must not be able to file a note against a house they are not on.
  let crossHomeInsertBlocked = false;
  try {
    await withUser(dspA, (db) =>
      db.query(
        `insert into ghh.notes (org_id, template_id, template_version, resident_id, home_id, shift_id, service_date, author_id)
         select $1, t.id, t.version, $2, $3, $4, current_date, $5 from ghh.form_templates t limit 1`,
        [ORG, residentB, homeB, shift, dspA]
      )
    );
  } catch {
    crossHomeInsertBlocked = true;
  }
  check('a DSP cannot write a note for another house', crossHomeInsertBlocked);

  // -------------------------------------------------------------------------
  section('Signed notes are immutable');
  // -------------------------------------------------------------------------
  const noteId = await withUser(dspA, async (db) => {
    const row = await db.one<{ id: string }>(
      `insert into ghh.notes (org_id, template_id, template_version, resident_id, home_id, shift_id, service_date, author_id, narrative)
       select $1, t.id, t.version, $2, $3, $4, current_date, $5, 'Draft narrative for the shift.'
       from ghh.form_templates t limit 1
       returning id`,
      [ORG, residentA, HOME_A, shift, dspA]
    );
    return row!.id;
  });
  check('a DSP can create a note in their own house', Boolean(noteId));

  await withUser(dspA, (db) =>
    db.query(
      `update ghh.notes set status = 'signed', signed_at = now(), signed_by = $2,
              signature_name = 'Test DSP', signature_title = 'DSP'
       where id = $1`,
      [noteId, dspA]
    )
  );

  const signed = await withSystem((db) =>
    db.one<{ locked: boolean; status: string }>('select locked, status from ghh.notes where id = $1', [noteId])
  );
  check('signing sets locked automatically', signed?.locked === true && signed.status === 'signed');

  // RLS filters rather than raising: the update policy requires `not locked`,
  // so a signed note matches no rows and the statement is a silent no-op.
  // That is safe, but it means the assertion has to be on rows affected — and
  // it is why the API route checks `locked` itself and returns a 409 instead
  // of reporting a save that did nothing.
  const affected = await withUser(dspA, (db) =>
    db.query<{ id: string }>(
      `update ghh.notes set narrative = 'tampered' where id = $1 returning id`,
      [noteId]
    )
  );
  check('a signed note matches zero rows for its author’s UPDATE', affected.length === 0);

  // The important one: not even a privileged connection can rewrite it.
  let superEditBlocked = false;
  try {
    await withSystem((db) =>
      db.query(`update ghh.notes set narrative = 'tampered by admin' where id = $1`, [noteId])
    );
  } catch {
    superEditBlocked = true;
  }
  check('not even a superuser connection can edit a signed note', superEditBlocked);

  let deleteBlocked = false;
  try {
    await withSystem((db) => db.query(`delete from ghh.notes where id = $1`, [noteId]));
  } catch {
    deleteBlocked = true;
  }
  check('a signed note cannot be deleted', deleteBlocked);

  const narrative = await withSystem((db) =>
    db.one<{ narrative: string }>('select narrative from ghh.notes where id = $1', [noteId])
  );
  check(
    'the signed text is unchanged after all attempts',
    narrative?.narrative === 'Draft narrative for the shift.',
    narrative?.narrative
  );

  // Corrections go in as addenda.
  await withUser(dspA, (db) =>
    db.query(
      `insert into ghh.note_addenda (org_id, note_id, author_id, body, signature_name, signature_title)
       values ($1, $2, $3, 'Correction: time of activity was later than recorded.', 'Test DSP', 'DSP')`,
      [ORG, noteId, dspA]
    )
  );
  const addenda = await withUser(dspA, (db) =>
    db.query('select id from ghh.note_addenda where note_id = $1', [noteId])
  );
  check('an addendum can be appended instead', addenda.length === 1);

  let addendumEditBlocked = false;
  try {
    await withSystem((db) => db.query(`update ghh.note_addenda set body = 'changed'`));
  } catch {
    addendumEditBlocked = true;
  }
  check('addenda are append-only', addendumEditBlocked);

  // -------------------------------------------------------------------------
  section('Medicaid ID encryption');
  // -------------------------------------------------------------------------
  const plain = await withSystem((db) =>
    db.one<{ v: string }>('select ghh.read_medicaid_id($1, $2) as v', [residentA, PHI_KEY])
  );
  check('decrypts with the right key', plain?.v === '109016522050');

  const stored = await withSystem((db) =>
    db.one<{ raw: string }>(
      `select encode(medicaid_id_enc, 'escape') as raw from ghh.residents where id = $1`,
      [residentA]
    )
  );
  check(
    'ciphertext on disk does not contain the number',
    !String(stored?.raw ?? '').includes('109016522050')
  );

  let wrongKeyFails = false;
  try {
    await withSystem((db) =>
      db.query('select ghh.read_medicaid_id($1, $2)', [residentA, 'wrong-key'])
    );
  } catch {
    wrongKeyFails = true;
  }
  check('the wrong key cannot decrypt it', wrongKeyFails);

  // The application role must not be able to call the decrypt function at all.
  let appRoleBlocked = false;
  try {
    await withUser(dspA, (db) =>
      db.query('select ghh.read_medicaid_id($1, $2)', [residentA, PHI_KEY])
    );
  } catch {
    appRoleBlocked = true;
  }
  check('the app role cannot call the decrypt function', appRoleBlocked);

  // -------------------------------------------------------------------------
  section('Identity does not leak between concurrent requests');
  // -------------------------------------------------------------------------
  // The dangerous failure mode on a single-connection database: two overlapping
  // requests sharing one session, so one user's query runs under another's
  // identity. Interleave them heavily and confirm each only ever sees its own.
  const interleaved = await Promise.all(
    Array.from({ length: 24 }, (_, i) => {
      const asA = i % 2 === 0;
      return withUser(asA ? dspA : dspB, async (db) => {
        const rows = await db.query<{ first_name: string }>(
          'select first_name from ghh.residents order by first_name'
        );
        return {
          expected: asA ? HOME_A_EXPECTED : HOME_B_EXPECTED,
          got: rows.map((r) => r.first_name)
        };
      });
    })
  );
  const leaked = interleaved.filter(
    (r) => JSON.stringify(r.got) !== JSON.stringify(r.expected)
  );
  check(
    '24 interleaved requests each saw only their own house',
    leaked.length === 0,
    leaked.length ? JSON.stringify(leaked.slice(0, 3)) : undefined
  );

  // -------------------------------------------------------------------------
  section('Audit trail');
  // -------------------------------------------------------------------------
  const audit = await withSystem((db) =>
    db.query<{ action: string }>('select action from ghh.audit_log order by at')
  );
  const actions = audit.map((a) => a.action);
  check(
    'note create, sign, and addendum were all recorded',
    ['note.create', 'note.sign', 'note.addendum'].every((a) => actions.includes(a)),
    actions.join(', ')
  );

  let auditEditBlocked = false;
  try {
    await withSystem((db) => db.query(`delete from ghh.audit_log`));
  } catch {
    auditEditBlocked = true;
  }
  check('the audit log cannot be deleted', auditEditBlocked);

  await closeDb();
  fs.rmSync(TMP, { recursive: true, force: true });

  console.log(
    failures === 0
      ? '\nAll database checks passed.\n'
      : `\n${failures} database check(s) FAILED.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  if (closeDb) await closeDb().catch(() => undefined);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
});
