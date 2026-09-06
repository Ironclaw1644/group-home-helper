-- The GENERIC template: a defensible progress note that claims no state.
--
-- WHAT THIS IS FOR
--
-- An agency signs up from a state nobody has authored a form for yet. There are
-- exactly three things the product can do:
--
--   1. Refuse to work until someone writes their state's template.
--   2. Hand them the nearest state's official form.
--   3. Give them a plain, complete progress note that does not pretend to be
--      any state's document.
--
-- (2) is the dangerous one and it is what the app did before this branch: it
-- printed Virginia's DBHDS Form #680, complete with the form number, to every
-- customer on the install. A document that carries another state's form number
-- gets signed, locked, and filed with Medicaid looking authoritative.
--
-- So this row is option (3). It is deliberately NOT tied to a state, and it
-- says so by omission rather than by inventing a citation:
--
--   * `form_number` is null.
--   * `footer.form_line` is 'Daily Progress Note' — no number, no agency, no
--     state, no "approved by" anything.
--   * `footer.legal_citation` is absent. That key exists for real, public,
--     citable rules; leaving it empty is the honest state for a template built
--     from no rule at all.
--
-- WHAT IT STILL GUARANTEES
--
-- Everything the engine guarantees: the service-plan page with all three
-- outcome states, unanswered activities printed as unanswered rather than
-- omitted, the signature block, the addenda page, immutability after signing,
-- and the audit trail. Those are properties of the engine, not of a
-- jurisdiction, so they are not the GENERIC template's to weaken.
--
-- It is a starting point for authoring a real state template, and
-- docs/adding-a-state.md says to copy it.

insert into ghh.form_templates (
  id, org_id, key, version, name, form_number, jurisdiction, schema, render_config
)
values (
  '00000000-0000-0000-0000-000000000101',
  null, -- global
  'daily_progress_note_generic',
  1,
  'Daily Progress Note',
  null, -- no form number: this is not a numbered state document
  'GENERIC',
  $json${
    "prompts": [
      "What support did {name} receive this shift?",
      "How did {subject} spend the day?",
      "How did {subject} respond to the support offered?",
      "Was there anything unusual — a refusal, an injury, or a change?"
    ],
    "sections": [
      {
        "key": "start_of_shift",
        "title": "Start of shift",
        "prompt_refs": [1],
        "fields": [
          {
            "key": "presentation",
            "type": "chips",
            "label": "How was {name} at the start of shift?",
            "multiple": true,
            "options": [
              { "value": "rested", "label": "Rested and settled" },
              { "value": "already_awake", "label": "Already awake" },
              { "value": "greeted_staff", "label": "Greeted staff in return" },
              { "value": "needed_prompting", "label": "Needed prompting to get going" },
              { "value": "low_mood", "label": "Low in mood", "flags_concern": true },
              { "value": "signs_of_distress", "label": "Showed signs of distress", "flags_concern": true }
            ]
          },
          {
            "key": "personal_care",
            "type": "chips",
            "label": "Personal care (grooming, hygiene, dressing)",
            "prompt_ref": 1,
            "multiple": true,
            "options": [
              { "value": "independent", "label": "Completed independently" },
              { "value": "verbal_prompts", "label": "Completed with verbal prompts" },
              { "value": "hands_on_assist", "label": "Required hands-on assistance" },
              { "value": "refused", "label": "Declined at first", "flags_concern": true }
            ]
          }
        ]
      },
      {
        "key": "meals",
        "title": "Meals",
        "grounding_vocabulary": [
          "meal", "meals", "ate", "eating", "eaten", "food", "breakfast",
          "lunch", "dinner", "snack", "appetite"
        ],
        "fields": [
          {
            "key": "meals_taken",
            "type": "chips",
            "label": "Meals and snacks",
            "multiple": true,
            "options": [
              { "value": "prepared_independently", "label": "Prepared independently" },
              { "value": "prepared_with_support", "label": "Prepared with staff support" },
              { "value": "ate_most", "label": "Ate most of what was offered" },
              { "value": "ate_some", "label": "Ate some of what was offered" },
              { "value": "refused", "label": "Declined a meal", "flags_concern": true }
            ]
          }
        ]
      },
      {
        "key": "activity",
        "title": "Activity and community",
        "prompt_refs": [2],
        "grounding_vocabulary": [
          "outing", "community", "transported", "trip", "visited", "excursion", "activity"
        ],
        "fields": [
          {
            "key": "location",
            "type": "chips",
            "label": "Where did {name} spend the day?",
            "prompt_ref": 2,
            "multiple": true,
            "allow_other": true,
            "options": [
              { "value": "stayed_home", "label": "Stayed home" },
              { "value": "day_program", "label": "Day programme" },
              { "value": "shops", "label": "Shops" },
              { "value": "park", "label": "Park or walk" },
              { "value": "appointment", "label": "Appointment" },
              { "value": "family_visit", "label": "Family visit" }
            ]
          },
          {
            "key": "engagement",
            "type": "chips",
            "label": "How did {name} respond?",
            "prompt_ref": 3,
            "multiple": true,
            "options": [
              { "value": "engaged", "label": "Took part willingly" },
              { "value": "chose_activity", "label": "Chose what to do" },
              { "value": "needed_encouragement", "label": "Needed encouragement" },
              { "value": "declined", "label": "Chose not to take part" }
            ]
          }
        ]
      },
      {
        "key": "health",
        "title": "Health and medication",
        "grounding_vocabulary": [
          "medication", "medications", "medicine", "dose", "nurse", "clinic",
          "appointment", "temperature", "pain"
        ],
        "fields": [
          {
            "key": "medication",
            "type": "chips",
            "label": "Medication",
            "multiple": true,
            "options": [
              { "value": "as_prescribed", "label": "Taken as prescribed" },
              { "value": "prompted", "label": "Taken with prompting" },
              { "value": "refused", "label": "Refused a dose", "flags_concern": true },
              { "value": "none_scheduled", "label": "None scheduled this shift" }
            ]
          },
          {
            "key": "health_observations",
            "type": "chips",
            "label": "Anything noticed about {possessive} health?",
            "multiple": true,
            "options": [
              { "value": "no_concerns", "label": "Nothing of concern" },
              { "value": "reported_pain", "label": "Reported pain or discomfort", "flags_concern": true },
              { "value": "appetite_change", "label": "Change in appetite", "flags_concern": true },
              { "value": "sleep_change", "label": "Change in sleep", "flags_concern": true }
            ]
          }
        ]
      },
      {
        "key": "status",
        "title": "Concerns",
        "prompt_refs": [4],
        "fields": [
          {
            "key": "incident",
            "type": "boolean",
            "label": "Was there an incident, injury, or concern this shift?",
            "prompt_ref": 4,
            "help": "An incident report may also be required by your licensing body.",
            "flags_concern_when_true": true
          },
          {
            "key": "incident_detail",
            "type": "text",
            "label": "What happened?",
            "multiline": true,
            "visible_when": { "field": "incident", "equals": true },
            "required_when": { "field": "incident", "equals": true }
          }
        ]
      }
    ],
    "narrative": {
      "key": "narrative",
      "type": "narrative",
      "label": "Progress note",
      "min_length": 120
    },
    "signature": {
      "key": "signature",
      "type": "signature",
      "attestation": "I attest that the services described above were provided as documented and that this note is a true and accurate record of this shift."
    }
  }$json$::jsonb,
  $render${
    "page": { "size": "LETTER", "margin": 42 },
    "header": { "title": "Daily Progress Note" },
    "footer": { "form_line": "Daily Progress Note" },
    "narrative_min_height": 340
  }$render$::jsonb
)
on conflict (id) do nothing;
