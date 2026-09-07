-- Ohio (US-OH): service documentation for homemaker/personal care.
--
-- ===========================================================================
-- READ THIS BEFORE SELLING ANYTHING ON THE BACK OF IT
-- ===========================================================================
--
-- **Ohio does not publish a numbered fill-in progress-note form.** Virginia
-- publishes DBHDS Form #680 as a document; Ohio publishes a RULE that
-- enumerates what service documentation must contain, and leaves the layout to
-- the provider. So this template is:
--
--     a layout built to satisfy Ohio Administrative Code 5123-9-30(E)
--
-- and it is NOT:
--
--     "Ohio's official form", "the State of Ohio progress note",
--     "DODD-approved", or anything of that shape.
--
-- Nothing in this row, and nothing it prints, claims otherwise. The footer
-- cites the rule and does not imply approval. Do not put a form number on it,
-- because there isn't one to put.
--
-- Sources (both consulted 2026-09-06, and they agree on the paragraph letter
-- and on all twelve elements):
--   https://codes.ohio.gov/ohio-administrative-code/rule-5123-9-30
--   https://www.law.cornell.edu/regulations/ohio/Ohio-Admin-Code-5123-9-30
-- Rule effective date shown at the first source: 2024-01-01. It is current as
-- of the date above and has not been re-checked since; whoever ships this to a
-- paying Ohio customer should re-read the rule first.
--
-- ---------------------------------------------------------------------------
-- Why Ohio, of the fifty
-- ---------------------------------------------------------------------------
--
-- Homemaker/personal care is the service a small Ohio group home actually
-- delivers and bills under the Individual Options and Level One waivers, and
-- Ohio's provider base is unusually long-tailed — independent providers and
-- very small agencies, certified individually, which is exactly the segment
-- priced out by Therap-scale software. It is also a rule that is public, free,
-- readable, and enumerated, which is what made an honest template possible.
--
-- ---------------------------------------------------------------------------
-- Element-by-element mapping of OAC 5123-9-30(E)
-- ---------------------------------------------------------------------------
--
--   (E)(1)  Type of service .................. render_config.service_type,
--                                              printed via the service_type source
--   (E)(2)  Date of service .................. service_date
--   (E)(3)  Place of service ................. place_of_service (the home)
--   (E)(4)  Name of individual ............... resident_legal_name
--   (E)(5)  Medicaid identification number ... medicaid_id
--   (E)(6)  Name of provider ................. org_line (the agency's legal
--                                              name, from ghh.organizations —
--                                              never from this row)
--   (E)(7)  Provider identifier/contract # ... provider_id
--                                              (organizations.medicaid_provider_id)
--   (E)(8)  Signature of the person
--           delivering the service ........... the signature block; the engine's
--                                              signature is server-timestamped
--                                              and cannot be backdated
--   (E)(9)  Group size ....................... group_size, counted from the
--                                              notes that exist for the same
--                                              home + shift + date
--   (E)(10) Description and details of
--           services delivered, related to
--           the approved ISP ................. the narrative, PLUS the service
--                                              plan page — which is the part
--                                              this product is actually good at
--   (E)(11) Number of units, or continuous
--           amount of uninterrupted time ..... ** NOT HELD BY THIS APP **
--                                              see below
--   (E)(12) Times service started/stopped .... shift_start / shift_stop, from
--                                              ghh.shifts
--
-- ---------------------------------------------------------------------------
-- The one element this template cannot fill: (E)(11), units
-- ---------------------------------------------------------------------------
--
-- Billing units live in the agency's billing system. This app records care, not
-- claims, and it has no units column — inventing one from the shift length
-- would be asserting uninterrupted service nobody observed, on a document used
-- to validate a Medicaid payment.
--
-- So the field is printed as a LABELLED EMPTY BLANK: the row below has a label
-- and no `source`, which is exactly how the paper equivalent handles a value
-- filled in later by someone else. The required element is visibly present and
-- visibly unfilled. That is honest; silently dropping it would not be, and
-- neither would guessing.
--
-- If units ever become a thing the app holds, add a `units` PrintSource and
-- point this field at it. Nothing else has to change.
--
-- ---------------------------------------------------------------------------
-- Where the on-screen chip vocabulary comes from
-- ---------------------------------------------------------------------------
--
-- The SECTIONS are Ohio's own service components, quoted from the definition of
-- homemaker/personal care at OAC 5123-9-30(B)(11)(a)-(i): self-advocacy
-- training, self-direction, daily living skills, implementation of recommended
-- therapeutic interventions, implementation of behavioral support strategies,
-- medical and health care services, emergency response training, community
-- access services, and assistance with personal finances.
--
-- The CHIPS inside each section are this app's drafting aid, not the state's
-- words. They exist so a DSP taps rather than types and so the model has
-- something to be grounded against. They carry no regulatory authority and a
-- provider should edit them to match how they actually work.

insert into ghh.form_templates (
  id, org_id, key, version, name, form_number, jurisdiction, schema, render_config
)
values (
  '00000000-0000-0000-0000-000000000102',
  null, -- global: available to every Ohio org on the install
  'service_documentation_hpc_oh',
  1,
  'Service Documentation — Homemaker/Personal Care',
  null, -- Ohio has no form number. Do not invent one.
  'US-OH',
  $json${
    "prompts": [
      "What homemaker/personal care did staff deliver to {name} this shift?",
      "How did each of those relate to {possessive} approved individual service plan?",
      "How did {name} respond to the support offered?",
      "Was there a refusal, an injury, an incident, or a change in condition?"
    ],
    "sections": [
      {
        "key": "daily_living",
        "title": "Daily living skills",
        "prompt_refs": [1],
        "grounding_vocabulary": [
          "grooming", "hygiene", "dressing", "bathing", "laundry", "cleaning",
          "household", "chores", "cooking", "meal", "meals", "ate", "eating"
        ],
        "fields": [
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
              { "value": "full_assist", "label": "Fully assisted by staff" },
              { "value": "refused", "label": "Declined at first", "flags_concern": true }
            ]
          },
          {
            "key": "household",
            "type": "chips",
            "label": "Household tasks",
            "prompt_ref": 1,
            "multiple": true,
            "options": [
              { "value": "laundry", "label": "Laundry" },
              { "value": "tidied_room", "label": "Tidied own room" },
              { "value": "kitchen", "label": "Kitchen clean-up" },
              { "value": "shopping_list", "label": "Helped with the shopping list" },
              { "value": "none_today", "label": "None this shift" }
            ]
          },
          {
            "key": "meals",
            "type": "chips",
            "label": "Meals and nutrition",
            "prompt_ref": 1,
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
        "key": "self_direction",
        "title": "Self-advocacy and self-direction",
        "prompt_refs": [2, 3],
        "grounding_vocabulary": [
          "chose", "choice", "decided", "asked for", "spoke up", "advocated", "preference"
        ],
        "fields": [
          {
            "key": "choices",
            "type": "chips",
            "label": "Choices {name} made",
            "prompt_ref": 3,
            "multiple": true,
            "allow_other": true,
            "options": [
              { "value": "what_to_eat", "label": "What to eat" },
              { "value": "what_to_wear", "label": "What to wear" },
              { "value": "how_to_spend_day", "label": "How to spend the day" },
              { "value": "who_to_see", "label": "Who to spend time with" },
              { "value": "declined_offer", "label": "Turned down something offered" }
            ]
          },
          {
            "key": "self_advocacy",
            "type": "chips",
            "label": "Speaking up for {object}self",
            "prompt_ref": 3,
            "multiple": true,
            "options": [
              { "value": "asked_for_help", "label": "Asked for help" },
              { "value": "stated_preference", "label": "Said what {subject} wanted" },
              { "value": "raised_concern", "label": "Raised a concern" },
              { "value": "no_opportunity", "label": "No occasion arose this shift" }
            ]
          }
        ]
      },
      {
        "key": "community_access",
        "title": "Community access",
        "prompt_refs": [1, 2],
        "grounding_vocabulary": [
          "community", "outing", "trip", "visited", "transported", "shops", "library"
        ],
        "fields": [
          {
            "key": "location",
            "type": "chips",
            "label": "Where did {name} go?",
            "prompt_ref": 1,
            "multiple": true,
            "allow_other": true,
            "options": [
              { "value": "stayed_home", "label": "Stayed home" },
              { "value": "day_program", "label": "Day programme" },
              { "value": "employment", "label": "Work" },
              { "value": "shops", "label": "Shops" },
              { "value": "park", "label": "Park or walk" },
              { "value": "appointment", "label": "Appointment" },
              { "value": "family_visit", "label": "Family visit" }
            ]
          },
          {
            "key": "transport",
            "type": "chips",
            "label": "How did {subject} get there?",
            "multiple": false,
            "options": [
              { "value": "agency_vehicle", "label": "Agency vehicle" },
              { "value": "public_transport", "label": "Public transport" },
              { "value": "walked", "label": "Walked" },
              { "value": "family", "label": "Family drove" },
              { "value": "not_applicable", "label": "Did not go out" }
            ]
          }
        ]
      },
      {
        "key": "health",
        "title": "Medical and health care",
        "prompt_refs": [1, 4],
        "grounding_vocabulary": [
          "medication", "medications", "medicine", "dose", "nurse", "clinic",
          "appointment", "therapy", "temperature", "pain", "seizure"
        ],
        "fields": [
          {
            "key": "medication",
            "type": "chips",
            "label": "Medication",
            "prompt_ref": 1,
            "multiple": true,
            "options": [
              { "value": "as_prescribed", "label": "Taken as prescribed" },
              { "value": "prompted", "label": "Taken with prompting" },
              { "value": "refused", "label": "Refused a dose", "flags_concern": true },
              { "value": "none_scheduled", "label": "None scheduled this shift" }
            ]
          },
          {
            "key": "therapeutic",
            "type": "chips",
            "label": "Recommended therapeutic interventions",
            "help": "Anything a clinician has asked staff to carry out — positioning, exercises, a swallowing protocol.",
            "prompt_ref": 1,
            "multiple": true,
            "options": [
              { "value": "carried_out", "label": "Carried out as written" },
              { "value": "partially", "label": "Partially carried out", "flags_concern": true },
              { "value": "declined", "label": "{name} declined", "flags_concern": true },
              { "value": "none_scheduled", "label": "None scheduled this shift" }
            ]
          },
          {
            "key": "health_observations",
            "type": "chips",
            "label": "Anything noticed about {possessive} health?",
            "prompt_ref": 4,
            "multiple": true,
            "options": [
              { "value": "no_concerns", "label": "Nothing of concern" },
              { "value": "reported_pain", "label": "Reported pain or discomfort", "flags_concern": true },
              { "value": "appetite_change", "label": "Change in appetite", "flags_concern": true },
              { "value": "sleep_change", "label": "Change in sleep", "flags_concern": true },
              { "value": "seen_by_clinician", "label": "Seen by a nurse or doctor" }
            ]
          }
        ]
      },
      {
        "key": "behavioral",
        "title": "Behavioural support",
        "prompt_refs": [1, 3],
        "grounding_vocabulary": [
          "behaviour", "behavior", "strategy", "de-escalate", "redirected", "calm", "upset"
        ],
        "fields": [
          {
            "key": "strategies",
            "type": "chips",
            "label": "Behavioural support strategies used",
            "help": "Only strategies written into {possessive} plan.",
            "prompt_ref": 1,
            "multiple": true,
            "options": [
              { "value": "none_needed", "label": "None needed this shift" },
              { "value": "redirection", "label": "Redirection" },
              { "value": "offered_space", "label": "Offered time and space" },
              { "value": "reduced_demands", "label": "Reduced demands" },
              { "value": "planned_routine", "label": "Followed the planned routine" }
            ]
          },
          {
            "key": "response",
            "type": "chips",
            "label": "How did {name} respond?",
            "prompt_ref": 3,
            "multiple": true,
            "options": [
              { "value": "settled", "label": "Settled" },
              { "value": "settled_slowly", "label": "Settled after a while" },
              { "value": "remained_upset", "label": "Remained upset", "flags_concern": true },
              { "value": "not_applicable", "label": "Not applicable" }
            ]
          }
        ]
      },
      {
        "key": "finances",
        "title": "Personal finances",
        "grounding_vocabulary": ["money", "cash", "spent", "purchase", "bought", "budget"],
        "fields": [
          {
            "key": "money",
            "type": "chips",
            "label": "Assistance with personal finances",
            "help": "Ohio counts this only alongside other homemaker/personal care.",
            "multiple": true,
            "options": [
              { "value": "none", "label": "None this shift" },
              { "value": "made_purchase", "label": "Made a purchase" },
              { "value": "counted_money", "label": "Counted or checked money" },
              { "value": "budget_talk", "label": "Talked through a spending plan" }
            ]
          }
        ]
      },
      {
        "key": "status",
        "title": "Incidents and concerns",
        "prompt_refs": [4],
        "fields": [
          {
            "key": "emergency_practice",
            "type": "chips",
            "label": "Emergency response",
            "help": "Drills and practice count as service delivery in Ohio.",
            "multiple": true,
            "options": [
              { "value": "none", "label": "None this shift" },
              { "value": "fire_drill", "label": "Fire or evacuation drill" },
              { "value": "reviewed_plan", "label": "Reviewed what to do in an emergency" }
            ]
          },
          {
            "key": "incident",
            "type": "boolean",
            "label": "Was there an incident, injury, or concern this shift?",
            "prompt_ref": 4,
            "help": "An incident report to your county board or DODD may also be required.",
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
      "label": "Description and details of services delivered",
      "min_length": 120
    },
    "signature": {
      "key": "signature",
      "type": "signature",
      "attestation": "I attest that I delivered the services described above as documented, and that this is a true and accurate record of this shift."
    }
  }$json$::jsonb,
  $render${
    "page": { "size": "LETTER", "margin": 42, "padding_bottom": 100 },
    "header": { "title": "Service Documentation — Homemaker/Personal Care" },
    "service_type": "Homemaker/Personal Care",
    "footer": {
      "form_line": "Service documentation — homemaker/personal care",
      "legal_citation": "Layout built to satisfy Ohio Administrative Code 5123-9-30(E). Not a state-issued form."
    },
    "narrative_min_height": 240,
    "identity_rows": [
      {
        "fields": [
          { "source": "resident_legal_name", "label": "Name of Individual: ", "width": 180, "grow": true },
          { "source": "medicaid_id", "label": "Medicaid ID: ", "width": 110 }
        ]
      },
      {
        "fields": [
          { "source": "org_line", "label": "Provider: ", "width": 200, "grow": true },
          { "source": "provider_id", "label": "Provider ID: ", "width": 100 }
        ]
      },
      {
        "fields": [
          { "source": "service_type", "label": "Type of Service: ", "width": 150, "grow": true },
          { "source": "place_of_service", "label": "Place of Service: ", "width": 130 }
        ]
      }
    ],
    "meta_rows": [
      {
        "fields": [
          { "source": "service_date", "label": "Date of Service: ", "width": 90 },
          { "source": "shift_start", "label": "Started: ", "width": 70 },
          { "source": "shift_stop", "label": "Stopped: ", "width": 70 }
        ]
      },
      {
        "fields": [
          { "source": "shift_label", "label": "Shift: ", "width": 100 },
          { "source": "group_size", "label": "Group Size: ", "width": 40 },
          { "label": "Units: ", "width": 60 }
        ]
      }
    ],
    "signature_block": {
      "label": "Signature of Person Delivering Service: ",
      "label_width": 232,
      "value_width": 180,
      "footer_fields": [
        { "source": "signature_title", "label": "Title: ", "width": 90 },
        { "source": "service_date", "label": "Date: ", "width": 90 }
      ]
    },
    "outcome_page": {
      "heading": "Services Delivered Against the Individual Service Plan — {resident}, {date}, {shift}",
      "status_labels": {
        "addressed": "Service delivered this shift",
        "not_addressed": "Not delivered this shift",
        "unanswered": "Not recorded — no answer documented"
      }
    },
    "addenda_page": { "heading": "Addenda — {resident}, {date}, {shift}" }
  }$render$::jsonb
)
on conflict (id) do nothing;
