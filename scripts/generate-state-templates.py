#!/usr/bin/env python3
"""Generate the migration that gives every US state a form template row.

Run after verify-citations.py has stripped everything it could not prove:

  python3 scripts/verify-citations.py /tmp/states-all.json --write
  python3 scripts/generate-state-templates.py /tmp/states-all.json

WHY THIS IS A GENERATOR AND NOT FORTY-NINE HAND-WRITTEN MIGRATIONS

Ohio's template is 482 lines because somebody read OAC 5123-9-30 end to end and
mapped all twelve of its elements onto printable fields. That is what a state
deserves and it does not scale to fifty by Tuesday. Pretending otherwise -- by
generating forty-nine files that *look* like Ohio's -- would produce exactly the
failure docs/adding-a-state.md exists to prevent: documents that appear to be
built on a rule nobody read.

So the rows this writes come in two honest tiers, and the difference is visible
on the printed page:

  TIER 1  a citation survived independent verification. The footer names the
          rule and says "Not a state-issued form". A reader can go and check it.

  TIER 2  everything else. No citation, no form number, no state's name on the
          document -- the same defensible note the GENERIC template prints. The
          state exists in the picker, so an agency there can sign up and work,
          and the page claims nothing about their regulations.

Tier 2 is not a stub or a placeholder. It is the correct output for a state
whose rule has not been read, and it is what forty-eight states shipped as on
day one of this feature. Promote a state to tier 1 by reading its rule and
re-running; nothing else has to change.

WHAT EVERY ROW INHERITS

`schema` is not copied into these rows. It is selected out of the GENERIC row at
insert time, so all fifty share one body of prompts, grounding vocabulary and
pronoun-safe wording. Copying it fifty times would mean fifty things to fix when
`verify:jurisdictions` finds a "they chooses", and forty-nine of them would be
missed.
"""

import json
import sys
from datetime import date

OUT = "supabase/migrations/0037_seed_remaining_state_templates.sql"

# Existing rows occupy the ...01NN block; this takes ...02NN.
UUID = "00000000-0000-0000-0000-0000000002{:02d}"
# v2 rows for states promoted to a verified citation; v1 stays for signed notes.
UUID_V2 = "00000000-0000-0000-0000-0000000003{:02d}"

# Ohio ships a citation footer at padding_bottom 100. The default is 76, which
# is sized for Form #680's footer -- a citation line added without raising this
# draws the signature row on top of the footer, on a signed Medicaid record.
PADDING_WITH_CITATION = 100

# Longest service-type string that may appear in a heading or footer line.
# Comfortably fits one line at the sizes TemplatePdf uses; past this it wraps
# into a paragraph and stops looking like a form.
HEADING_MAX = 48


def sql_str(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def render_config(state: dict) -> dict:
    """The printed document for one state. Every key omitted keeps #680's default."""
    cfg = {
        "page": {"size": "LETTER", "margin": 42},
        "header": {"title": "Daily Progress Note"},
        "footer": {"form_line": "Daily Progress Note"},
        "narrative_min_height": 340,
    }

    if state.get("confidence") != "primary-source-read" or not state.get("citation"):
        return cfg  # tier 2: identical to GENERIC, claiming nothing

    cfg["page"]["padding_bottom"] = PADDING_WITH_CITATION
    cfg["footer"]["legal_citation"] = (
        f"Layout built to satisfy {state['citation']}. Not a state-issued form."
    )
    service = (state.get("service_type") or "").strip()

    # A service type only belongs in the heading if it is a NAME.
    #
    # Researchers wrote whatever the state calls the service, and some of them
    # wrote an essay: one Ohio-style entry ran to 400 characters, complete with
    # procedure codes, ratio modifiers and a grandfathering clause. Interpolated
    # straight into the title and the footer, that printed a paragraph across
    # the top and the bottom of a Medicaid form. Twenty states shipped that way.
    #
    # Short enough to read on one line becomes the heading. Anything longer is
    # kept out of the furniture entirely — the note is still correct, it simply
    # keeps the plain title, which is what every uncited state already prints.
    if service and len(service) <= HEADING_MAX:
        cfg["service_type"] = service
        cfg["header"]["title"] = f"Service Documentation — {service}"
        cfg["footer"]["form_line"] = f"Service documentation — {service.lower()}"
    return cfg


def main() -> None:
    states = json.load(open(sys.argv[1]))

    # West Virginia is hand-authored in 0041 from the state's own document —
    # the only real form in the country. Generating a row for it too would put
    # two v2 templates on one jurisdiction and leave which-one-wins to
    # migration order.
    states = sorted(
        (s for s in states if s["code"] != "US-WV"), key=lambda s: s["code"]
    )

    tier1 = [s for s in states if s.get("confidence") == "primary-source-read" and s.get("citation")]
    t1codes = {s['code'] for s in tier1}
    tier2 = [s for s in states if s['code'] not in t1codes]

    out = []
    w = out.append

    w(f"-- Every remaining US state gets a form template row.")
    w("--")
    w("-- Generated by scripts/generate-state-templates.py from researched state")
    w(f"-- documentation rules, on {date.today().isoformat()}. Regenerate rather than")
    w("-- hand-editing: the generator is where the tiering rule lives.")
    w("--")
    w("-- ===========================================================================")
    w("-- READ THIS BEFORE SELLING ANYTHING ON THE BACK OF IT")
    w("-- ===========================================================================")
    w("--")
    w("-- These rows are NOT state-issued forms. Across all fifty states and DC,")
    w("-- exactly one publishes a document a provider fills in for progress notes:")
    w("-- West Virginia, and that one is hand-authored in 0041 rather than")
    w("-- generated here. Virginia was long believed to be a second — it is not;")
    w("-- see 0040. What a state publishes, if anything, is a rule saying what")
    w("-- documentation must contain, leaving the layout to the provider.")
    w("--")
    w("-- So the rows below come in two tiers, and the tier is visible on the page.")
    w("--")
    w(f"-- TIER 1 — {len(tier1)} state(s) whose citation was independently verified.")
    w("--   scripts/verify-citations.py fetched the state's own code site, confirmed")
    w("--   the rule number appears there, and confirmed a verbatim quotation from")
    w("--   the rule appears there too. The footer cites the rule and says plainly")
    w("--   that it is not a state-issued form.")
    if tier1:
        for s in tier1:
            w(f"--     {s['code']}  {s['name']:22} {s['citation']}")
            w(f"--            {s['source_url']}")
    else:
        w("--     (none survived verification)")
    w("--")
    w(f"-- TIER 2 — {len(tier2)} state(s) shipping with no citation at all.")
    w("--   Either no rule was found, or what was found could not be verified against")
    w("--   the state's own site. These print exactly what the GENERIC template")
    w("--   prints: a complete, defensible progress note that names no state and")
    w("--   cites no rule. That is the honest output for a rule nobody has read, and")
    w("--   it is materially better than the alternative -- an agency in one state")
    w("--   filing a document that carries another state's form number.")
    w("--")
    w("--   An agency in a tier 2 state can still sign up and work. Nothing about")
    w("--   their document is wrong; it simply makes no regulatory claim.")
    w("--")
    w("-- WHAT SALES MAY SAY")
    w("--   Tier 1: \"we file to your state's rule, and here is the rule.\"")
    w("--   Tier 2: \"we'll build your state in if you're first.\"")
    w("--   Neither tier may ever be described as \"we have your state's form\".")
    w("--")
    w("-- Rules change. Every citation here was checked on the generation date above")
    w("-- and has not been re-checked since. Whoever sells into a tier 1 state should")
    w("-- re-read the rule first.")
    w("--")
    w("-- `schema` is selected from the GENERIC row rather than copied, so all of")
    w("-- these share one body of prompts and grounding vocabulary.")
    w("")

    for i, s in enumerate(states, start=1):
        code = s["code"]
        key = f"daily_progress_note_{code.split('-')[1].lower()}"
        cfg = render_config(s)
        tier = 1 if s['code'] in t1codes else 2
        w(f"-- {code} {s['name']} (tier {tier})")
        if tier == 1:
            w(f"--   {s['citation']} — {s['source_url']}")
            if s.get("effective_date"):
                w(f"--   effective {s['effective_date']}")
        elif s.get("demoted_reason"):
            w(f"--   no citation: {s['demoted_reason']}")
        else:
            w("--   no rule located; ships as the generic note")
        if tier == 1:
            # Promote by adding a version, never by editing the row in place.
            # A signed note is pinned to the exact template it was signed under
            # (getTemplateForNote -> getTemplateById, which does not filter on
            # active), so rewriting v1's footer would put a citation on records
            # that were signed before anyone had read the rule. Deactivating v1
            # and activating v2 leaves every signed note printing exactly what
            # it printed the day it was signed, and sends only new notes to the
            # cited layout.
            # Insert first, then set activity by id.
            #
            # This used to deactivate every active row for the state and then
            # insert v2. Correct once, wrong on the second run: the insert is
            # "on conflict do nothing", so re-applying deactivated the v2 that
            # already existed and then declined to recreate it, leaving the
            # state with no active template at all. Twenty-one states lost
            # their citation that way, silently, because a no-op insert reports
            # success. Deciding activity by id afterwards converges no matter
            # how many times it runs.
            w("insert into ghh.form_templates (")
            w("  id, org_id, key, version, name, form_number, jurisdiction,")
            w("  jurisdiction_name, schema, render_config")
            w(")")
            w("select")
            w(f"  '{UUID_V2.format(i)}'::uuid, null, {sql_str(key + '_v2')}, 2,")
            w(f"  'Daily Progress Note', null, {sql_str(code)}, {sql_str(s['name'])},")
            w("  g.schema,")
            w(f"  {sql_str(json.dumps(cfg, ensure_ascii=False))}::jsonb")
            w("from ghh.form_templates g")
            w("where g.key = 'daily_progress_note_generic' and g.org_id is null")
            w("on conflict (id) do nothing;")
            # Rewrite the config as well as activating it. The insert above is
            # "on conflict do nothing", so a row generated by an earlier run
            # keeps whatever it was born with -- which is how twenty states sat
            # with a 338-character paragraph across their header and footer
            # through a regeneration that was supposed to fix exactly that.
            w("update ghh.form_templates set")
            w(f"  render_config = {sql_str(json.dumps(cfg, ensure_ascii=False))}::jsonb,")
            w("  updated_at = now()")
            w(f" where id = '{UUID_V2.format(i)}'::uuid;")
            w("update ghh.form_templates set")
            w(f"  active = (id = '{UUID_V2.format(i)}'::uuid), updated_at = now()")
            w(f" where org_id is null and jurisdiction = {sql_str(code)};")
        else:
            w("insert into ghh.form_templates (")
            w("  id, org_id, key, version, name, form_number, jurisdiction,")
            w("  jurisdiction_name, schema, render_config")
            w(")")
            w("select")
            w(f"  '{UUID.format(i)}'::uuid, null, {sql_str(key)}, 1,")
            w(f"  'Daily Progress Note', null, {sql_str(code)}, {sql_str(s['name'])},")
            w("  g.schema,")
            w(f"  {sql_str(json.dumps(cfg, ensure_ascii=False))}::jsonb")
            w("from ghh.form_templates g")
            w("where g.key = 'daily_progress_note_generic' and g.org_id is null")
            w("on conflict (id) do nothing;")
        w("")

    open(OUT, "w").write("\n".join(out))
    print(f"wrote {OUT}")
    print(f"  {len(states)} state rows: {len(tier1)} with a verified citation, {len(tier2)} without")
    if tier1:
        print("  verified:", ", ".join(s["code"] for s in tier1))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main()
