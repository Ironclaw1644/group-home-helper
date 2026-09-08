-- West Virginia (US-WV): the state's own Direct Support Progress Note.
--
-- ===========================================================================
-- THIS ONE IS AN ACTUAL FORM
-- ===========================================================================
--
-- Across all fifty states and DC, exactly one publishes a document a provider
-- is meant to fill in for progress notes. West Virginia does. Everywhere
-- else — Virginia included, as 0040 had to admit — the state publishes a rule
-- and leaves the layout to the provider.
--
-- Source, fetched and read in full:
--   https://wvaso.acentra.com/wp-content/uploads/sites/19/2025/01/IDD_07_Direct-Support-Doc_11.01.23.doc
--   West Virginia I/DD Waiver, direct support documentation, revised 11.01.23.
--   Published by Acentra Health, the ASO that administers the I/DD waiver for
--   the WV Bureau for Medical Services. Consulted 2026-09-08 and not re-checked
--   since; whoever sells into West Virginia should open it first.
--
-- The file carries three forms. This template reproduces the second:
--
--   1. DIRECT SUPPORT SERVICE LOG — a time sheet. Date, ID, start, stop, total,
--      "Was training provided? (Y/N)", staff initials. This app does not hold
--      billing units or a per-entry service code, so it is NOT reproduced here.
--   2. DIRECT SUPPORT PROGRESS NOTE — the narrative form. This one.
--   3. TRANSPORTATION LOG — odometer readings and trip reasons. Not this app.
--
-- There is no `legal_citation` on this row, and that is deliberate. That field
-- is for a RULE the layout was built to satisfy, and verify:jurisdictions
-- rightly rejected an attempt to put a provenance note in it. West Virginia is
-- the other case: this is not a layout answering to a rule, it is the state's
-- own form reproduced. The footer says which document, and its revision date,
-- which is what a reader needs to check us.
--
-- form_number stays null. The document numbers nothing on its face; "IDD_07"
-- is a filename on the ASO's website, not a form number printed on the page,
-- and 0040 is a fresh enough lesson about the difference between a document's
-- identifier and something that merely looks like one. What the form does have
-- is a title, and the footer prints that title exactly.
--
-- ---------------------------------------------------------------------------
-- THE FOUR QUESTIONS ARE THE STATE'S, WORD FOR WORD
-- ---------------------------------------------------------------------------
--
-- The form prints one prompt above the narrative column:
--
--   "Were there any parts of the goal in which the person did especially well
--    or poorly? Did anything out of the ordinary occur (such as illness,
--    behaviors, etc.)? Did the person require more support than usual? How did
--    the person respond to support and services provided?"
--
-- Those four are transcribed verbatim into `prompts`, so a West Virginia note
-- prints the questions the state actually asks rather than a paraphrase. The
-- pronoun placeholders are ours; the wording is theirs.
--
-- ---------------------------------------------------------------------------
-- ONE THING TO BE HONEST WITH A WEST VIRGINIA BUYER ABOUT
-- ---------------------------------------------------------------------------
--
-- The form's own subtitle says it is "To be used with Traditional Service
-- Delivery Model and if something out of the ordinary occurs while providing
-- services." It is EXCEPTION-BASED. West Virginia's per-shift document is the
-- Service Log; the Progress Note is for the shifts that had something in them.
--
-- This app writes a note every shift. An agency using it in West Virginia is
-- therefore documenting more than the state asks, not less. That is a safe
-- direction to be wrong in and an unsafe one to reverse, but it should be said
-- plainly in a sales conversation rather than discovered later: we do not
-- replace the Service Log, and we do not do transportation.

update ghh.form_templates
   set active = false, updated_at = now()
 where org_id is null and jurisdiction = 'US-WV' and active;

insert into ghh.form_templates (
  id, org_id, key, version, name, form_number, jurisdiction,
  jurisdiction_name, schema, render_config
)
select
  '00000000-0000-0000-0000-000000000398'::uuid,
  null,
  'direct_support_progress_note_wv',
  2,
  'Direct Support Progress Note',
  null,
  'US-WV',
  'West Virginia',
  jsonb_set(
    jsonb_set(
      g.schema,
      '{prompts}',
      $prompts$[
        "Were there any parts of the goal in which {name} did especially well or poorly?",
        "Did anything out of the ordinary occur (such as illness, behaviors, etc.)?",
        "Did {subject} require more support than usual?",
        "How did {subject} respond to support and services provided?"
      ]$prompts$::jsonb
    ),
    '{signature,attestation}',
    to_jsonb(
      'I attest that the services described above were provided as documented and that this note is a true and accurate record of this shift.'::text
    )
  ),
  $render${
    "page": { "size": "LETTER", "margin": 42, "padding_bottom": 100 },
    "header": { "title": "Direct Support Progress Note" },
    "footer": {
      "form_line": "WV I/DD Waiver — Direct Support Progress Note (rev. 11.01.23)"
    },
    "identity_rows": [
      {
        "fields": [
          { "source": "resident_legal_name", "label": "Name of Person Who Receives Services: ", "width": 200, "grow": true },
          { "source": "medicaid_id", "label": "Medicaid ID: ", "width": 110 }
        ]
      },
      {
        "fields": [
          { "source": "org_line", "label": "Provider Agency: ", "width": 220, "grow": true },
          { "source": "provider_id", "label": "Provider ID: ", "width": 100 }
        ]
      }
    ],
    "meta_rows": [
      {
        "fields": [
          { "source": "service_date", "label": "Date: ", "width": 90 },
          { "source": "shift_start", "label": "Time: ", "width": 70 },
          { "source": "signature_name", "label": "Provider/Staff: ", "width": 140, "grow": true }
        ]
      }
    ],
    "signature_block": {
      "label": "Provider/Staff Signature: ",
      "label_width": 150
    },
    "narrative_min_height": 300
  }$render$::jsonb
from ghh.form_templates g
where g.key = 'daily_progress_note_generic' and g.org_id is null
on conflict (id) do nothing;

-- Converge on re-run.
update ghh.form_templates
   set active = (id = '00000000-0000-0000-0000-000000000398'::uuid), updated_at = now()
 where org_id is null and jurisdiction = 'US-WV';
