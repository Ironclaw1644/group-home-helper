# Adding a state

How to make this product usable by an agency in a state it does not yet
support. `docs/engine-jurisdiction-seam.md` is the why; this is the how.

**The short version.** A jurisdiction is one row in `ghh.form_templates`,
shipped as a migration. No TypeScript changes, no new component, no deploy of
anything but the migration. If you find yourself editing a `.tsx` file to add a
state, something has leaked back across the seam — fix that instead, and
`npm run verify:jurisdictions` should have caught it.

---

## Before you write any SQL

Answer these four. They are not paperwork; three of the four decide what the
document is allowed to claim.

**1. Does this state publish a form, or a rule?**

Virginia publishes DBHDS Form #680 — a numbered document with a layout. Ohio
publishes OAC 5123-9-30, a rule enumerating twelve things service documentation
must contain, and leaves the layout to the provider. These are different
products:

| The state publishes | `form_number` | `footer.form_line` | `footer.legal_citation` |
|---|---|---|---|
| A numbered form | its number | the form's own name | optional |
| Only a rule | **null** | a plain description | the rule, plus "Not a state-issued form" |
| Neither, or you have not read it | **null** | plain description | **omit it** |

A form number is a claim that a numbered state document exists and that this is
it. A citation is a claim that you read the rule. Neither is decoration. An
invented one on a Medicaid record is worse than a blank page, because a blank
page does not get filed.

**2. What is the source, and is it current?**

Find the primary source — the state's own code site, not a vendor's summary or
a PDF someone emailed. Record the URL and the effective date in the migration
header. Say in the header when you last checked, and say plainly that whoever
sells into that state should re-read it first. Rules change; a comment that
claims to be permanently true will be wrong and nobody will know when it became
so.

**3. Which service are you documenting?**

Not "the state's form" — the form for a service. Ohio's template covers
homemaker/personal care because that is what a small Ohio group home bills. A
different waiver service is a different template, and probably a different row.

**4. What does the state require that this app does not hold?**

There will be something. Ohio requires billing units; units live in the
agency's billing system and this app has no column for them. **Print the label
with an empty blank** — a `PrintField` with a `label` and no `source` renders a
labelled ruled line, exactly as the paper equivalent does for a value someone
fills in later. The required element is visibly present and visibly unfilled.
Inventing it and silently dropping it are both worse, and only one of them is
obviously worse.

---

## The row

```sql
insert into ghh.form_templates (
  id, org_id, key, version, name, form_number, jurisdiction, jurisdiction_name,
  schema, render_config
) values (
  '00000000-0000-0000-0000-0000000001NN',
  null,                       -- global: every org in this state gets it
  'daily_progress_note_xx',   -- unique across the install
  1,
  'Daily Progress Note',
  null,                       -- or the state's form number, if one exists
  'US-XX',                    -- ISO-3166-2 shaped, or the literal GENERIC
  'Montana',                  -- what a human is offered in the picker
  $json${ ... }$json$::jsonb,
  $render${ ... }$render$::jsonb
);
```

Constraints worth knowing before you hit a check violation:

- `jurisdiction` must match `^([A-Z]{2}-[A-Z]{2}|GENERIC)$` (0030).
- `org_id null` means every org in that jurisdiction. A non-null `org_id` is one
  agency's private variant; it beats the global row for that agency only, and it
  is **not** offered on the sign-up page.
- One active global row per jurisdiction. Two makes resolution depend on
  `version` alone, and `verify:jurisdictions` fails.
- The row is shared by every agency in that state. **It may not contain an
  agency name, address or provider number** — those come from
  `ghh.organizations` via `lib/branding/print.ts`, per request, and
  `verify:branding` fails the build if one reaches a template.

### `schema` — the on-screen form

```jsonc
{
  "prompts":   ["What did staff do for {name}?", "..."],  // the printed questions
  "sections":  [ { "key", "title", "prompt_refs", "fields", "grounding_vocabulary" } ],
  "narrative": { "key": "narrative", "type": "narrative", "label": "...", "min_length": 120 },
  "signature": { "key": "signature", "type": "signature", "attestation": "..." },
  "outcome_library": [ /* optional starter service-plan outcomes */ ]
}
```

- `{name}`, `{subject}`, `{object}`, `{possessive}` are substituted per resident.
  Write so all three pronoun sets work: "{subject} chose", never "{subject}
  chooses" — `verify:jurisdictions` sweeps for "they chooses" and will find it.
- `grounding_vocabulary` is what stops the model writing about a topic the DSP
  never touched. It is per section, and it is worth the ten minutes.
- `outcome_library` is optional. Omit it rather than copying another state's:
  a template outcome is a drafting aid, and the wrong state's aid is worse than
  none. When it is absent the "start from the library" button simply is not
  offered.

### `render_config` — the printed document

Every key is optional, and **every default is Form #680**. A template that sets
nothing prints exactly what Virginia printed before templates existed — which is
what makes the regression bar provable, so do not change a default to suit a new
state. Set what differs and leave the rest alone.

The keys that matter for a new state:

| Key | What it does |
|---|---|
| `header.title` | The heading on the page |
| `footer.form_line` | The line at the foot of every page |
| `footer.legal_citation` | Small print under it. Only if it is real |
| `service_type` | The state's own words for what service this is |
| `identity_rows` | Labelled blanks above the title |
| `meta_rows` | Labelled blanks between the title and the prompts |
| `signature_block` | Signature label, its width, and the footer fields |
| `outcome_page` | Service-plan page heading and its status vocabulary |
| `page.padding_bottom` | Raise it if your footer is taller than #680's |

A field's `source` must be one of `PRINT_SOURCES` (`lib/types.ts`) — a closed
set, because a template is untrusted data and the renderer is not an evaluator.
Omit `source` for a labelled blank. If your state needs a value the app holds
but the list does not name, add it to `PRINT_SOURCES` and resolve it in
`lib/pdf/print-context.ts`; that is a real code change and belongs in its own
commit.

Two traps:

- **`page.padding_bottom` defaults to 76**, which is what #680's footer needs. A
  taller footer — a citation line, say — without raising this draws the
  signature row on top of the footer. On a signed Medicaid record that is not
  cosmetic.
- **A long `signature_block.label` needs an explicit `label_width`.** Without
  one the text engine wraps it into a narrow column instead of giving it room.

### What you cannot put in a row

`SUPPORT_LEVELS`, `PROGRESS_LEVELS` and `MEASURE_TYPES` are Postgres enums
(`ghh.outcome_support_level`, `ghh.outcome_progress`,
`ghh.activity_measure_type`). A template can **rename** them —
`support_level_labels`, `progress_labels`, `outcome_page.status_labels`,
`outcome_page.activity_labels` — but it cannot add a sixth support level without
a migration that alters the enum. Renaming is usually enough; Ohio ships
"Service delivered this shift" where Virginia says "Addressed this shift".

One label you may rename but must not remove: the **unanswered** state. The
renderer merges your `status_labels` over the defaults, so all three survive
whatever you set. An outcome nobody answered has to print as unanswered, in
every template — printing it as a negative asserts a clinical judgement no one
made, on a document used to validate a payment. `verify:jurisdictions` checks
this for every seeded template, including yours, automatically.

---

## Wiring, which is already done

Nothing below needs touching. Listed so you can confirm the row is enough:

- **The picker.** `ghh.available_jurisdictions()` reads the installed global
  templates, so your state appears at sign-up and in Settings the moment the
  migration runs. It also returns your `header.title`, `footer.form_line` and
  identity labels, so the preview beside the picker shows your form and not
  Virginia's.
- **Sign-up and Settings** validate the choice against that same function, so an
  agency can never be put in a state with no form.
- **Resolution** is `own template > your jurisdiction > GENERIC`, in
  `pickTemplate()` and in `ghh.template_for_org()`. There is no rule 4 and no
  nearest match.
- **Signed notes are pinned.** `getTemplateForNote()` prints a signed note on the
  template it was signed under; the database refuses to repoint it. Correcting a
  jurisdiction changes new notes only.
- **The outcome library, the AI prompts and the AI grounding** all read your
  schema.

---

## Verifying it

```
npm run typecheck
npm run verify:jurisdictions
```

`verify:jurisdictions` applies every migration to a throwaway Postgres, reads
the rows back and, for **each** seeded template including yours, checks that:

- Virginia's PDF is still byte-for-byte what it was before templates existed;
- your template renders, is well-formed, and has prompts, sections, a narrative
  and an attestation;
- it carries no agency identity;
- if it claims a citation, the citation looks like one;
- if it is GENERIC it claims no form number;
- an unanswered outcome and an unanswered activity print as unanswered;
- its starter library, if any, has activities, daily questions, unique keys and
  no "they chooses";
- the picker offers it under a human name, with the captions it really prints;
- and the renderer still contains no jurisdiction literal.

Add your own assertions for the elements your state requires by name. Ohio's
block in that script checks all twelve of OAC 5123-9-30(E) by paragraph number,
so a layout edit that drops "Place of Service" fails the run rather than being
noticed by an auditor. Copy that pattern; it is the part of the file worth
copying.

Then look at the PDF:

```
npm run pdf:sample
```

---

## The honesty rules, in one place

1. No form number unless the state publishes one.
2. No citation unless you read the rule, and it is public and free to read.
3. If the layout is yours rather than the state's, the document says so —
   Ohio's prints "Not a state-issued form" on every page.
4. A required element the app cannot fill prints as a labelled blank. Never a
   guess, never silently absent.
5. Never another state's form. When nothing matches, the caller gets an error
   and no document; `GENERIC` exists so that "we have not built your state yet"
   degrades into a plain, unclaimed note rather than into someone else's
   official-looking one.
