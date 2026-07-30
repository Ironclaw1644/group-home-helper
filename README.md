# Group Home Helper — Daily Progress Notes

Staff-facing app for **At Home Family Services, LLC**. Replaces the handwritten
**Daily Progress Note, Form #680** that a DSP fills out for every resident, on
every shift, every day.

Two things it does:

1. **Makes the daily note fast.** Tap what actually happened; the note writes
   itself in the agency's own voice; sign it on the phone; it locks.
2. **Generates realistic training examples.** A complete, unwatermarked sample
   note about a fictional resident, for showing new staff what good looks like.

> **This app handles protected health information.** It lives in its own `ghh`
> schema with Row Level Security on every table, signed notes that are immutable
> at the database level, encrypted Medicaid IDs, and an append-only audit log.
> If you deploy it, read **PHI handling** below first — a hosted deployment
> needs BAAs with your host and your model vendor.


---

## Live

| | |
| --- | --- |
| App | https://group-home-helper.vercel.app |
| Install page | https://group-home-helper.vercel.app/download |
| Source | https://github.com/Ironclaw1644/group-home-helper |

Send staff to `/download`. It works without an account — which it has to, since
nobody has one before their first shift — and covers both the iPhone
Add-to-Home-Screen steps and the Android app file.

### Updating it

Because the APK is a shell around this server, **the app updates when you
deploy.** Push to `main` (or run `vercel deploy --prod`) and every phone has the
new version next time it opens. No reinstall, no store review, no chasing staff.

A new APK is only needed when the *shell* changes — a different server address,
package id, app name, or native permission. Bump `APK_VERSION` in
[lib/apk.ts](lib/apk.ts), rebuild, and `/download` will show the new version
alongside a changelog; `/api/app-version` lets an installed shell check itself.

---

## Stack

Next.js 15 App Router · React 19 · TypeScript · Tailwind · Supabase (Postgres +
Auth + Storage) · `@react-pdf/renderer` · a **local model via Ollama** by
default, with Anthropic as an opt-in alternative.

---

## Setup

### 1. Install the note assistant (local model)

```bash
brew install ollama          # or https://ollama.com/download
ollama serve
ollama pull qwen3.5:9b
```

That is the whole AI setup. No account, no API key, no per-note cost, and no
note content ever leaves the machine.

Roughly 6.6 GB on disk and about 6 GB of memory while resident. On the
reference machine a note takes ~12 seconds. If that is too slow, `qwen2.5:7b`
is smaller and faster — but see *Choosing a model* below before switching.

### 2. Configure the environment

```bash
cp .env.example .env.local
openssl rand -base64 32   # PHI_ENCRYPTION_KEY
```

The defaults already point at a local Ollama, so you only need the Supabase URL
and keys plus the encryption key.

Use the **publishable** key for `NEXT_PUBLIC_SUPABASE_ANON_KEY` and a
**secret** key for `SUPABASE_SECRET_KEY`. The secret key is server-side only and
must never be bundled into the mobile app — it bypasses RLS, and an APK is a zip
file.

### 3. Apply the schema

Already applied to the current project. For a fresh one, run
`supabase/migrations/` in order:

| File | What it does |
| --- | --- |
| `0001_schema.sql` | Tables, `org_id` on everything, Medicaid ID encryption |
| `0002_rls.sql` | Row Level Security — the actual access boundary |
| `0003_immutability.sql` | Signed notes become permanently un-editable |
| `0005_audit.sql` | Audit triggers and the roster query |
| `0006_storage.sql` | Private `ghh-signatures` bucket |

Then seed the Form #680 template and starting data:

```bash
npm run db:seed
```

Finally, **expose the `ghh` schema to the API** — Supabase dashboard →
Project Settings → API → *Exposed schemas* → add `ghh`, or:

```sql
alter role authenticator set pgrst.db_schemas = '<existing list>, ghh';
notify pgrst, 'reload schema';
```

Without it every query fails with `Invalid schema: ghh`, regardless of grants
or policies. After changing it, PostgREST also needs the schema-cache reload —
a config reload alone is not enough.

### 4. Create the first admin

```bash
npm run bootstrap:admin -- admin@athomefamilyservices.com "Jane Doe"
```

Prints a one-time password. Change it on first sign-in. Every other staff
account is created from the app.

### 5. Run it

```bash
npm run dev
```

---

## Getting it on phones

The UI is built phone-first — 44px tap targets, 16px inputs so iOS doesn't zoom,
a draw-to-sign canvas made for a finger. Staff reach it two ways.

### iPhone — install the PWA

Safari → Share → **Add to Home Screen**. Full AHFS icon, opens full-screen with
no browser chrome, and a service worker so the shell loads without a
connection.

There is no iOS build in this repo, and that is not an oversight — building one
needs Xcode (~40 GB) *and* a paid Apple account to get it onto a phone at all.
See the table below.

Apple has no free sideloading path:

| Route | Cost | Catch |
| --- | --- | --- |
| Ad Hoc distribution | $99/yr | Register every phone by UDID (max 100); profile expires annually and breaks all of them the same day |
| Enterprise Program | $299/yr | Apple requires 100+ employees and audits it — a group home won't qualify |
| Free Xcode signing | $0 | App dies after 7 days; needs a Mac to re-sign weekly |
| TestFlight | $99/yr | Still App Store Connect, still a review, builds expire every 90 days |

The PWA gives the same icon and the same full-screen behaviour for nothing, on
both platforms, and updates the moment you restart the server — no review, no
re-install, no expiry.

### Offline behaviour (both platforms)

A service worker caches the app shell so it opens without a connection, and an
in-progress note stays in `localStorage` until it saves. When the phone is
offline the app shows a banner saying the note is held locally rather than
saved to the record.

**The service worker deliberately caches no resident data.** Caching note pages
and API responses would make the roster work offline — and would leave names,
Medicaid IDs, and narratives in an unencrypted cache on a personal phone that
could be lost or sold. Anything that could carry PHI is network-only with a
graceful failure; see the comment at the top of `public/sw.js`.

### Android — sideload the APK

Same PWA install works ("Install app" in Chrome). For a real installable
package:

```bash
GHH_SERVER_URL=http://192.168.1.40:3000 npm run apk
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk` (~4 MB). Host it
anywhere staff can tap it — they allow "install from this source" once — or push
it over USB with `adb install -r`.

**Toolchain** (one-time, via Homebrew):

```bash
brew install openjdk@21
brew install --cask android-commandlinetools
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

**It must be JDK 21.** Capacitor 8 fails on JDK 17 with
`invalid source release: 21`. `scripts/build-apk.sh` locates a 21 install
itself rather than trusting whatever `java` is first on PATH, and errors with
the install command if it can't find one.

Built and verified: `com.athomefamilyservices.notes`, minSdk 24 (Android 7+),
targetSdk 36, AHFS launcher icons at all five densities. Expect a Play Protect
warning on first install — normal for sideloaded apps.

The APK is a native shell around the running server, not a bundle of static
files — the app is server-rendered and needs its API routes. So one codebase,
and an update is a server restart rather than a re-install on every phone. If
the server is unreachable it shows a plain "can't reach the notes server" page
with a retry, and any in-progress note is still cached on the phone.

**Set `GHH_SERVER_URL` to the machine actually running the app.** A LAN address
means phones work on house wifi; a public HTTPS address means they work
anywhere.

---

## Trying the APK against a local model

The APK contains no model and cannot — the smallest of these is 4.7 GB, and a
phone-sized model (1–3 GB) is materially worse than the 7B, which is the point
at which invented events start appearing. The model always runs on a server.

To point the phone at a local model instead of the deployed hosted one, run the
app on your Mac bound to the LAN and rebuild the shell against that address:

```bash
# On the Mac — pick a model
npm run dev:local-ai-fast     # qwen2.5:7b  — ~4s per note
npm run dev:local-ai          # qwen3.5:9b  — ~12s per note

# In another terminal — point the APK at the Mac's LAN address
GHH_SERVER_URL=http://10.0.0.5:3000 npm run apk
```

Both machines have to be on the same wifi, and the Mac has to stay awake. This
is a testing setup, not a deployment: nobody can write a note while that laptop
is asleep.

---

## Choosing a model

Measured on the reference machine with the real prompts and the real guards
(`npm run verify:ai`, 5 runs per case):

| Model | Median latency | Grounding | Verdict |
| --- | --- | --- | --- |
| `qwen2.5:7b` | **4.4s** | 10/10 clean | Fastest. Slightly looser prose — see below. |
| `qwen3.5:9b`, reasoning **off** | 12.1s | 10/10 clean | **Default.** Tightest output. |
| `qwen3.5:9b`, reasoning **on** | ~460s | clean | Unusable — no DSP waits eight minutes. |

**On the 7B:** an earlier round of this table called it unsafe, because it
invented a meal and lifted sentences out of the style example. That turned out
to be the prompt's fault rather than the model's — it was being shown a full
completed note and completing the pattern. With skeleton patterns and the
closing sentence moved into code, it passes every run and is ~3× faster.

It is still a little looser in register: it will write soft filler like
"ensuring he remained comfortable and content", which the guards cannot flag
because it names no specific event. Harmless, but it reads less like the
agency's own voice. The 9B stays the default for that reason, not for safety.

Two things that came out of testing and are now baked in:

- **Reasoning mode is off** (`OLLAMA_THINK=false`). Turning it on made the same
  model nearly 40× slower for no measurable gain in note quality.
- **The style anchor is sentence patterns, not a sample note.** An earlier
  version showed the model a real completed note to set the voice; smaller
  models pattern-completed from it and pasted its events into unrelated notes
  ("a nutritious dinner was served and enjoyed" on a shift with no meal
  recorded). Skeletons with `[slots]` carry the register with nothing liftable.

If you swap models, run `npm run verify:ai` before trusting it. Every run must
pass — a note that invents an event is a falsified record, so "usually correct"
is not a passing grade.

---

## How the AI works

Two modes, one engine, one hard rule.

### Draft Assist — for real notes

The DSP taps chips for what happened. Those selections are the **only** thing
the model may describe. The system prompt forbids inventing activities, meals,
times, quotes, medical observations, or other people, and instructs the model
to write a short note rather than pad a thin one.

Deterministic checks then run over the generated text (`lib/ai/guard.ts`),
because a model that hallucinates is not a reliable narrator of its own
hallucinations:

- **Unselected options** — the note mentions a museum trip that was never
  selected.
- **Unrecorded topics** — a whole section with nothing recorded, but its
  vocabulary shows up anyway.
- **Invented times** — a clock time or duration, which the form never captures.
- **Quoted speech** — the form has no field for it, so a quotation is always
  invented.

Two things are decided by code rather than by the model:

- **The closing sentence.** *"There were no problems or concerns during shift"*
  is appended when nothing recorded flags a concern, and stripped when
  something does. It is a factual claim about the shift, fully determined by
  the data — and instructing a model to produce it worked only about a third of
  the time locally.
- **Whole-topic fabrication.** If nothing was recorded in a section, that
  section's vocabulary must not appear at all. This is what catches an invented
  meal: per-option checks only know about words that are option labels, and
  "meal" is nobody's option label.

Anything flagged is shown to the DSP before they sign. The narrative is never
saved without them seeing it.

### Training Example — for onboarding

Generates a complete, realistic note that **prints identically to a real one** —
no watermark, no badge, no disclaimer on the document face. A stamped-up sample
doesn't teach anyone what their own note should look like.

It is written about a fictional demo resident, and the server refuses to
generate one for a real resident:

```
Training examples can only be generated for the demo resident.
```

Inventing a shift for a real person would put a fabricated account into their
medical record. That check lives in `app/api/ai/draft/route.ts`, not in the UI.

Training examples are signable and behave like any other note, with one
exception: they are excluded from billing packets. There is no claim to attach
them to — no resident, no service, no shift worked. They export separately as a
training pack.

---

## PHI handling

| Where | How it's protected |
| --- | --- |
| Medicaid IDs | Encrypted with pgcrypto; the key is passed per-call and never stored in the database |
| Row access | RLS on every table — a DSP sees only residents in homes they're assigned to |
| Signed notes | Immutable at the database level; corrections are addenda |
| Signatures | Private storage bucket, no client-side read policy |
| Audit | Every create/update/sign/view/PDF/export recorded, append-only |
| Model calls | Nothing leaves the machine on the default local provider |

### Why the default install needs no BAA

With `AI_PROVIDER=local` and a local Supabase, every piece of PHI — names,
Medicaid IDs, narratives — stays on the operator's own hardware. There is no
third party to sign an agreement with.

### If you switch to the hosted provider

`AI_PROVIDER=anthropic` sends note content off the machine, which needs signed
BAAs with **Anthropic** and with **your host** (plus a HIPAA-eligible Supabase
plan if the database is hosted too).

Until those are executed, leave `AI_DEIDENTIFY=true`: the model then receives a
placeholder name and no identifiers, and the real name is restored locally
after generation. The flag is ignored by the local provider, where there is
nothing to protect against.

---

## Verification

```bash
npm run verify:guardrails   # grounding, concern rule, de-identification, duplicates
npm run pdf:sample          # writes tmp/sample-form-680.pdf
npm run verify:ai           # live model checks (needs ANTHROPIC_API_KEY)
npm run typecheck
npm run build
```

`verify:guardrails` needs no key and no database. It covers the properties that
must hold regardless of how the model behaves, so run it on every change.

Compare the output of `pdf:sample` against the scanned original in Drive
(`EE/detail.jpg`) — header, the five numbered prompts, narrative block,
signature line, and the `Daily Progress Notes Form #680` footer should line up.

### Checks worth doing by hand

- **Immutability** — sign a note, then try `UPDATE ghh.notes SET narrative = '…'`
  in the SQL editor. It must fail.
- **RLS** — sign in as a DSP assigned to one house and confirm a resident in
  another returns zero rows through the client, not just a hidden UI.
- **Offline** — draft a note, kill wifi mid-typing, reload. The draft survives.

---

## Per-agency branding

The palette lives in `ghh.organizations.branding` and is emitted as CSS custom
properties, which Tailwind's `brand.*` utilities read. Every existing class
re-themes automatically — onboarding another agency is a database row, not a
rebuild.

To propose a theme from an agency's own website:

```bash
npm run brand:scan -- athomefamilyservices.com
```

It reads the markup and same-origin stylesheets and ranks the colors it finds.
Run against At Home Family Services it recovers all five brand colors exactly,
plus the logo.

Two things worth knowing about how it picks:

- **Framework neutrals are filtered out.** Tailwind's and Bootstrap's grey ramps
  appear constantly and win on raw frequency; left in, the first scan chose
  Tailwind gray-200 for the page background over the agency's actual warm sand.
- **It is a proposal, not an application.** A site that paints entirely from
  JavaScript yields little, so a supervisor reviews and adjusts before it
  applies.

The fetch is SSRF-guarded (public hosts only — no loopback, RFC1918, or cloud
metadata) and every color is validated as a hex literal before it reaches CSS,
since branding is user-editable and can come from an arbitrary site.

---

## Adding another form

Form #680 is the first row in `ghh.form_templates`, not hardcoded. Its `schema`
jsonb drives the web form, the AI grounding input, and the PDF.

To add a second form (MAR, incident report): insert a template row, and add a
branch for any new field type in both `components/form/FieldRenderer.tsx` and
`lib/pdf/Form680.tsx`. There is no form-builder UI yet — that is Phase 4,
alongside multi-tenant hardening.

---

## Open item

The seeded shifts are `7AM-7PM` and `7PM-7AM`, inferred from the scanned form.
**Confirm the real shift definitions and resident roster with the client**
before go-live; they are seeded in `0004_seed_680.sql`.
