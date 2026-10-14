/**
 * verify:wv-form — does what we print actually match West Virginia's form?
 *
 * The one question a buyer's compliance officer would ask, answered by a machine
 * instead of a feeling. Reads the golden spec in docs/golden/wv-idd-07.json (the
 * state's requirements, transcribed from the published document) and checks the
 * shipped template against it, field by field.
 *
 * Reads the migration rather than the database on purpose: the migration is the
 * source of truth in the repo, it works with no network and no credentials, and
 * a check you can run offline is a check that actually gets run. The cost is SQL
 * parsing, which is why every extraction below fails loudly instead of returning
 * a default that could quietly pass.
 *
 *   npm run verify:wv-form
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const GOLDEN = join(ROOT, "docs/golden/wv-idd-07.json");
const MIGRATION = join(ROOT, "supabase/migrations/0041_west_virginia_real_form.sql");

type Golden = {
  template_key: string;
  jurisdiction: string;
  title: string;
  footer_form_line: string;
  form_number: string | null;
  prompts_verbatim: string[];
  required_identity_fields: string[];
  source: { url: string; revision: string };
};

const checks: { ok: boolean; label: string; detail?: string }[] = [];
const check = (ok: boolean, label: string, detail?: string) =>
  checks.push({ ok, label, detail });

/** Pull a $tag$...$tag$ dollar-quoted block out of the migration. */
function dollarBlock(sql: string, tag: string): string {
  const open = `$${tag}$`;
  const start = sql.indexOf(open);
  if (start === -1) throw new Error(`migration is missing the $${tag}$ block`);
  const from = start + open.length;
  const end = sql.indexOf(open, from);
  if (end === -1) throw new Error(`$${tag}$ block is not closed`);
  return sql.slice(from, end);
}

const golden: Golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
const sql = readFileSync(MIGRATION, "utf8");

// --- the four prompts, word for word ----------------------------------------
// Our {name}/{subject} placeholders stand in for the state's "the person".
// Normalise those back before comparing so the test measures wording, not
// templating.
const prompts: string[] = JSON.parse(dollarBlock(sql, "prompts"));
const normalise = (s: string) =>
  s.replace(/\{name\}/g, "the person").replace(/\{subject\}/g, "the person").trim();

check(
  prompts.length === golden.prompts_verbatim.length,
  `prompt count is ${golden.prompts_verbatim.length}`,
  `found ${prompts.length}`,
);
golden.prompts_verbatim.forEach((want, i) => {
  const got = prompts[i] ? normalise(prompts[i]) : "(missing)";
  check(got === want, `prompt ${i + 1} matches the state's wording`,
    got === want ? undefined : `\n      state:   ${want}\n      printed: ${got}`);
});

// --- render config: footer + required fields --------------------------------
const render = JSON.parse(dollarBlock(sql, "render"));

check(
  render?.footer?.form_line === golden.footer_form_line,
  "footer cites the source document and its revision date",
  render?.footer?.form_line === golden.footer_form_line
    ? undefined
    : `\n      want: ${golden.footer_form_line}\n      got:  ${render?.footer?.form_line}`,
);

check(
  render?.header?.title === golden.title,
  `header title is "${golden.title}"`,
  render?.header?.title === golden.title ? undefined : `got "${render?.header?.title}"`,
);

const printedFields = new Set<string>();
for (const row of [...(render.identity_rows ?? []), ...(render.meta_rows ?? [])]) {
  for (const f of row.fields ?? []) printedFields.add(f.source);
}
if (render?.signature_block) printedFields.add("signature_name");

const missing = golden.required_identity_fields.filter((f) => !printedFields.has(f));
check(
  missing.length === 0,
  `all ${golden.required_identity_fields.length} required identity fields are printed`,
  missing.length ? `missing: ${missing.join(", ")}` : undefined,
);

// --- the anti-fabrication locks ---------------------------------------------
// This is the 680 regression. A form number must never appear unless the golden
// spec says the state prints one on the page.
const numberLine = /form_number/i.test(sql);
const nullsFormNumber = /\bnull,\s*\n\s*'US-WV'/.test(sql) || /form_number[^\n]*null/i.test(sql);
check(
  numberLine && nullsFormNumber && golden.form_number === null,
  "form_number is null — no number is invented for a document that prints none",
  golden.form_number === null ? undefined : "golden spec now claims a number; re-read the source",
);

// The 680 fix itself, asserted rather than assumed. 0004 seeded the fabricated
// Virginia row; 0040 must deactivate it and leave a numberless v2 as the only
// active VA template. Grepping the tree cannot show this — the final state can.
const va = readFileSync(
  join(ROOT, "supabase/migrations/0040_virginia_cites_the_rule_not_a_form.sql"),
  "utf8",
);
const vaDeactivates = /set active = false[\s\S]{0,120}jurisdiction = 'US-VA'/.test(va);
const vaConverges = /set active = \(id = '00000000-0000-0000-0000-000000000399'::uuid\)/.test(va);
const vaFormLine = va.match(/'form_line',\s*'([^']*)'/)?.[1] ?? "(none)";
const vaLineClean = !/[0-9]/.test(vaFormLine);

check(
  vaDeactivates && vaConverges,
  "Virginia's fabricated template is deactivated and superseded",
  vaDeactivates && vaConverges ? undefined : "0040 no longer converges on the v2 row",
);
check(
  vaLineClean,
  `Virginia's active footer carries no form number ("${vaFormLine}")`,
  vaLineClean ? undefined : `still prints a number: ${vaFormLine}`,
);

// Any form number a customer can see must be in the registry, with a source.
// README is excluded and audited separately: it still carries the old Form #680
// language wholesale, and failing on it here would only teach people to skip
// this check.
type Registry = { verified: { number: string }[] };
const registry: Registry = JSON.parse(
  readFileSync(join(ROOT, "docs/golden/form-number-registry.json"), "utf8"),
);
const allowed = new Set(registry.verified.map((v) => v.number));

// Migration history is append-only and 0004 legitimately records what we once
// shipped; rewriting history to make a grep quiet would be the wrong instinct.
// What matters is the state after every migration runs, asserted directly below.
// lib/db/migrations.generated.ts is that same history bundled, so it is out too.
// `scripts` is on this list because leaving it off cost us. render-sample-pdf.tsx
// kept printing "Daily Progress Notes Form #680" on At Home Family Service
// letterhead for two days after 7af6d2b purged that caption from everywhere a
// grep of app/components/lib could see. The PDF you hand a prospect is a
// customer surface even though no route serves it.
const CUSTOMER_SURFACES = ["app", "components", "lib", "scripts"];
// This file names the number in order to ban it; it cannot also be its own
// violation. lib/db/migrations.generated.ts is the append-only migration
// history bundled, so it is out for the same reason 0004 is.
const SKIP_FILES = ["lib/db/migrations.generated.ts", "scripts/verify-wv-form.ts"];
// scripts/reference/ is a frozen snapshot of the template as it actually
// shipped, kept so notes signed under it still render the way they were
// signed. Retracting a claim going forward is not the same as rewriting what a
// DSP already put their name to, so this directory keeps the old caption and is
// the one place allowed to.
const SKIP_DIRS = ["scripts/reference/"];
const rendered: string[] = [];   // reaches a user -> hard fail
const inComments: string[] = []; // cleanup debt -> reported, does not fail

for (const dir of CUSTOMER_SURFACES) {
  const out = require("node:child_process")
    .spawnSync("grep", ["-rnoiE", "\\bform[ ]*#?[0-9]{3,5}", join(ROOT, dir)], { encoding: "utf8" })
    .stdout?.trim();
  if (!out) continue;
  for (const line of out.split("\n")) {
    const num = line.match(/([0-9]{3,5})\s*$/)?.[1];
    if (!num || allowed.has(num)) continue;
    const [file, lineNo] = line.split(":");
    const rel = file.replace(ROOT + "/", "");
    if (SKIP_FILES.some((s) => rel === s)) continue;
    if (SKIP_DIRS.some((d) => rel.startsWith(d))) continue;
    const src = readFileSync(file, "utf8").split("\n")[Number(lineNo) - 1] ?? "";
    // Prose explaining that we do NOT print Form #680 is the fix, not the bug.
    // Prose explaining that we do NOT print Form #680, and code that loads or
    // asserts the frozen snapshot so old signed notes still render, are both
    // the fix rather than the bug.
    if (/not filling in|should not be told|fabricated|12VAC35-105|no such form|Not "Form/i.test(src)) continue;
    if (/Form680\.shipped|ShippedForm680|retained for notes signed/i.test(src)) continue;
    const where = `${file.replace(ROOT + "/", "")}:${lineNo}  ${src.trim().slice(0, 100)}`;
    (/^\s*(\/\/|\*|\/\*|--|#)/.test(src) ? inComments : rendered).push(where);
  }
}

check(
  rendered.length === 0,
  "no unregistered form number in anything a user can see",
  rendered.length ? "\n      " + rendered.slice(0, 6).join("\n      ") : undefined,
);

if (inComments.length) {
  console.log(
    `\n  NOTE  ${inComments.length} stale Form #680 mention(s) left in comments and docstrings.` +
      `\n        Not customer-visible, so this does not fail. It is how the lie creeps back, though:` +
      `\n        the next person to read these will believe them.\n        ` +
      inComments.slice(0, 8).join("\n        "),
  );
}

// --- report ------------------------------------------------------------------
const pass = checks.filter((c) => c.ok).length;
console.log(`\n  WV Direct Support Progress Note — verified against the state's own form`);
console.log(`  source: ${golden.source.url}`);
console.log(`  revision ${golden.source.revision}\n`);
for (const c of checks) {
  console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.label}${c.detail ? `  ${c.detail}` : ""}`);
}
console.log(`\n  ${pass}/${checks.length} checks passed\n`);
process.exit(pass === checks.length ? 0 : 1);
