# The engine / jurisdiction seam

**Written before any code changed, on branch `multi-state` at `7d06e00`.**

This is the map that the multi-state work was built against: what part of this
app is *the engine* (true for every customer in every state) and what part is
*Virginia* (true only for a DBHDS-licensed provider filing Form #680). Anything
in the second column has to become data before an Ohio customer can use the
product.

Read this first. `docs/adding-a-state.md` is the how-to; this is the why.

---

## The claim being tested

The note engine — observation → ISP outcome → signature → locked PDF — is
state-agnostic. What is Virginia-specific is the *form*.

That claim is **mostly true and was worth trusting**, but it was not true at
five specific places, listed below. Four of them are one-line couplings; the
fifth (the PDF renderer) is real work.

---

## Already generic — do not touch

These read a `FormTemplate` row and have no idea what state they are in. They
were correct before this branch and are correct after it.

| Component | Why it is already generic |
|---|---|
| `ghh.form_templates` | Rows, not modules. Already has a nullable `org_id` where null means "every org". The table was built for this. |
| `FormTemplateSchema` (`lib/types.ts:304`) | `prompts` / `sections` / `narrative` / `signature` are already the whole definition of the on-screen form. |
| `components/form/FieldRenderer.tsx` | Switches on `field.type`, never on a form number. |
| `lib/ai/guard.ts` | Grounds the model against `schema.sections`. The vocabulary it polices is whatever the template says it is. |
| `lib/ai/prompts.ts` | Builds the prompt from `schema`. |
| `lib/forms/interpolate.ts` | `{name}` / `{subject}` substitution — pure. |
| `lib/notes/prestage.ts` | Derives concern keys from `schema`. |
| `0003_immutability.sql` | Signed-note immutability, append-only addenda and audit log. Nothing here knows about a form. |
| `0005_audit.sql`, `lib/audit.ts` | Same. |
| `lib/branding/print.ts` | Already resolves *who filed the document* from `ghh.organizations`, per request, under the caller's own RLS. This is the pattern the rest of the seam was made to match. |

`lib/branding/print.ts` deserves a specific note: it is the existing, working
example of the exact separation this branch generalises. **The template
describes the form; the org describes who filed it.** That sentence is already
written in the code (`Form680.tsx:137-143`) and it is the rule the jurisdiction
work follows too — with one more axis added: *the jurisdiction describes what
the form must contain.*

---

## Where Virginia was welded in

### 1. Template resolution — the primary violation

`lib/notes/repo.ts:17`

```ts
const TEMPLATE_KEY = 'daily_progress_note_680';

export async function getActiveTemplate(): Promise<FormTemplate> { … }
```

One module-level constant, and a function that takes **no arguments at all** —
no org, no jurisdiction, no session. Nine call sites across the note page, the
PDF route, the sign route, the AI draft route, the batch export and the
prestage repo all get the same Virginia row no matter who is asking.

This is the seam. Everything else is downstream of it.

### 2. The PDF renderer is a Virginia form drawn in JSX

`lib/pdf/Form680.tsx` reads *some* things from the template
(`schema.prompts`, `renderConfig.header.title`, `renderConfig.footer.form_line`,
`formNumber`, `narrative_min_height`) and hardcodes the rest in the component
body:

| Hardcoded in JSX | Line |
|---|---|
| `Individual's Name:` label + field width | `262` |
| `Medicaid:` label + field width | `266` |
| `Date:` / `Shift/Time:` meta row, and its field order | `275`, `279` |
| `Staff Signature:` label | `298` |
| `Title:` / `Date:` footer row | `316`, `320` |
| `Service Plan Documentation — …` page heading | `342` |
| `Addenda — …` page heading | `427` |
| Outcome status vocabulary: `Addressed this shift` / `Not addressed this shift` / `Not recorded — no answer documented` | `356-360` |
| Activity answer vocabulary: `Yes` / `No` / `Not recorded` | `383-388` |
| Which identity fields exist, and in what order | the JSX itself |

`RenderConfig` (`lib/types.ts:312`) is four optional keys wide. It can say the
form's *title* and *form line*; it cannot say what fields the form has, what
they are called, or what order they print in. An Ohio form needs a provider
contract number, a place of service, a group size and start/stop times — none
of which this component can be told about without editing it.

Note the irony already in the tree: `lib/types.ts:7` tells you to handle new
field types in `lib/pdf/TemplatePdf.tsx`. **That file did not exist.** The
comment describes the design that was intended; `Form680.tsx` is what got
built.

### 3. Outcome vocabulary is a TypeScript module

`lib/outcomes/virginia-library.ts` exports `VIRGINIA_OUTCOME_LIBRARY` as a
const array, imported directly by:

- `app/api/outcomes/install-library/route.ts:6` (server route)
- `lib/onboarding/provision.ts:5` (demo/signup provisioning)
- `components/outcomes/library-picker.tsx:7` (**client** component)
- `scripts/verify-import.ts:12`

Adding Ohio's vocabulary means editing a module and redeploying — which is
exactly the thing the goal forbids. The client import also means the whole
Virginia library ships in the browser bundle for every customer.

### 4. Organizations have no jurisdiction

`ghh.organizations` (`0001_schema.sql:36`) carries `name`, `legal_name`,
`medicaid_provider_id`, `logo_url`, `timezone` — and no state. There is
nothing to match a template against. `timezone` is the closest thing and it is
not the same question: a Virginia provider can run on `America/Chicago`.

### 5. Virginia clinical vocabulary compiled into `lib/types.ts`

`SUPPORT_LEVELS`, `PROGRESS_LEVELS` and `MEASURE_TYPES` (`lib/types.ts:118-149`)
are DBHDS's vocabulary, exported as consts and used for both storage values and
printed labels.

**These are only half-movable, and it matters.** The *values* are Postgres
enums — `ghh.outcome_support_level`, `ghh.outcome_progress`
(`0015_outcomes.sql:95-96`) and `ghh.activity_measure_type`
(`0017:44`) — so a state cannot introduce a new support level without a
migration. The *labels* are free. This branch makes labels template-driven and
leaves the value sets fixed, and `docs/adding-a-state.md` says so plainly
rather than pretending a new state can invent its own enum from a JSON row.

---

## Where the seam sits after this branch

```
                    ENGINE                    │            JURISDICTION
                    (code)                    │              (rows)
──────────────────────────────────────────────┼──────────────────────────────────
 note lifecycle, autosave, prestage           │  ghh.form_templates.jurisdiction
 signing + immutability + audit log           │    ├── schema.prompts
 RLS and tenancy                              │    ├── schema.sections
 AI drafting and grounding                    │    ├── schema.outcome_library
 lib/pdf/TemplatePdf.tsx  (generic renderer)  │    ├── render_config.identity_rows
 lib/pdf/print-context.ts (value resolution)  │    ├── render_config.signature_block
 lib/branding/print.ts    (who filed it)      │    ├── render_config.outcome_page
                                              │    └── render_config.footer
──────────────────────────────────────────────┼──────────────────────────────────
 ghh.organizations.jurisdiction ──────────────┘  matched to a template, never
                                                 across a jurisdiction boundary
```

Three separate questions, three separate owners:

1. **What must the form contain?** → the jurisdiction, via the template row.
2. **Who filed it?** → the org, via `lib/branding/print.ts`. Unchanged.
3. **What happened on the shift?** → the note. Unchanged.

The renderer is not allowed to answer any of the three from a literal.

---

## The rule that keeps this honest

A template may only be resolved for an org whose `jurisdiction` matches the
template's, or for the explicit `GENERIC` fallback. There is no cross-state
fallback and no "nearest match". A Virginia provider printing an Ohio form is a
worse failure than printing no form at all, because it is a document that looks
official and is filed with Medicaid.

`scripts/verify-jurisdictions.tsx` asserts this, along with the byte-level
Virginia regression bar.
