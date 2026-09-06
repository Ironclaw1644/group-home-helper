-- Seed: Form #680 (Daily Progress Note) + At Home Family Services org data.
--
-- The template `schema` is the single definition of the form. The web form,
-- the AI grounding input, and the PDF all read from it, so adding a field
-- means editing this JSON rather than three React files.
--
-- Chip vocabulary is drawn from the exemplar note in EE/detail.jpg so that
-- generated narrative lands in the agency's existing documentation voice.
--
-- The render_config carries no agency name or logo. This template row is
-- global (org_id null) and is shared by every agency on the install, so an
-- identity here is printed on everybody's forms — which is exactly what used
-- to happen. Who filed the document comes from ghh.organizations at render
-- time; this JSON only describes the form itself.

-- ---------------------------------------------------------------------------
-- Organization, home, shifts
-- ---------------------------------------------------------------------------

insert into ghh.organizations (id, name, legal_name, timezone)
values (
  '00000000-0000-0000-0000-000000000001',
  'At Home Family Services',
  'At Home Family Service, LLC',
  'America/New_York'
)
on conflict (id) do nothing;

insert into ghh.homes (id, org_id, name)
values (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Main House'
)
on conflict (id) do nothing;

-- The scanned form shows 7AM-7PM, implying a matching overnight shift.
-- CONFIRM WITH CLIENT before go-live; adjust labels here if they differ.
insert into ghh.shifts (id, org_id, home_id, label, start_time, end_time, crosses_midnight, sort_order)
values
  (
    '00000000-0000-0000-0000-000000000020',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    '7AM-7PM', '07:00', '19:00', false, 1
  ),
  (
    '00000000-0000-0000-0000-000000000021',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    '7PM-7AM', '19:00', '07:00', true, 2
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Demo resident — the subject of AI-generated training examples.
--
-- Fictional. Notes about this resident render and print identically to real
-- notes (that is the point: trainees should see the real target), but they are
-- excluded from billing exports because no service was delivered.
-- ---------------------------------------------------------------------------

insert into ghh.residents (
  id, org_id, home_id, first_name, last_name,
  medicaid_id_demo, pronoun_subject, pronoun_object, pronoun_possessive,
  is_demo
)
values (
  '00000000-0000-0000-0000-000000000030',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000010',
  'Alex', 'Sample',
  '100000000000', 'he', 'him', 'his',
  true
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Form #680 template
-- ---------------------------------------------------------------------------

insert into ghh.form_templates (id, org_id, key, version, name, form_number, schema, render_config)
values (
  '00000000-0000-0000-0000-000000000100',
  null, -- global template
  'daily_progress_note_680',
  1,
  'Daily Progress Note',
  '680',
  $json${
    "prompts": [
      "Where did {name} choose to go?",
      "What did {name} do while there?",
      "How did {name} choose the activity?",
      "Did {subject} enjoy the activity?",
      "How did staff support {name}?"
    ],
    "sections": [
      {
        "key": "start_of_shift",
        "title": "Start of shift",
        "fields": [
          {
            "key": "waking",
            "type": "chips",
            "label": "How was {name} at the start of shift?",
            "multiple": true,
            "options": [
              { "value": "resting_comfortably", "label": "Asleep, resting comfortably" },
              { "value": "already_awake", "label": "Already awake" },
              { "value": "awake_early", "label": "Awake early" },
              { "value": "greeted_staff", "label": "Greeted staff in return" },
              { "value": "needed_prompting", "label": "Needed prompting to wake" },
              { "value": "signs_of_distress", "label": "Showed signs of distress", "flags_concern": true }
            ]
          },
          {
            "key": "adls",
            "type": "chips",
            "label": "ADLs (grooming, hygiene, dressing)",
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
          "lunch", "dinner", "snack", "nutritious", "well-balanced", "appetite"
        ],
        "fields": [
          {
            "key": "breakfast",
            "type": "chips",
            "label": "Breakfast",
            "multiple": true,
            "options": [
              { "value": "prepared_independently", "label": "Prepared independently" },
              { "value": "prepared_with_support", "label": "Prepared with staff support" },
              { "value": "ate_100", "label": "Ate 100%" },
              { "value": "ate_75", "label": "Ate about 75%" },
              { "value": "ate_50", "label": "Ate about 50%" },
              { "value": "refused", "label": "Declined the meal", "flags_concern": true }
            ]
          },
          {
            "key": "lunch",
            "type": "chips",
            "label": "Lunch",
            "multiple": true,
            "options": [
              { "value": "at_home", "label": "Eaten at home" },
              { "value": "in_community", "label": "Eaten in the community" },
              { "value": "ate_100", "label": "Ate 100%" },
              { "value": "ate_75", "label": "Ate about 75%" },
              { "value": "ate_50", "label": "Ate about 50%" },
              { "value": "refused", "label": "Declined the meal", "flags_concern": true }
            ]
          },
          {
            "key": "dinner",
            "type": "chips",
            "label": "Dinner",
            "multiple": true,
            "options": [
              { "value": "prepared_independently", "label": "Prepared independently" },
              { "value": "prepared_with_support", "label": "Prepared with staff support" },
              { "value": "ate_100", "label": "Ate 100%" },
              { "value": "ate_75", "label": "Ate about 75%" },
              { "value": "ate_50", "label": "Ate about 50%" },
              { "value": "refused", "label": "Declined the meal", "flags_concern": true }
            ]
          }
        ]
      },
      {
        "key": "activity",
        "title": "Activity and community",
        "prompt_refs": [1, 2, 3, 4],
        "grounding_vocabulary": [
          "outing", "community", "transported", "trip", "visited", "excursion"
        ],
        "fields": [
          {
            "key": "location",
            "type": "chips",
            "label": "Where did {name} choose to go?",
            "prompt_ref": 1,
            "multiple": true,
            "allow_other": true,
            "options": [
              { "value": "stayed_home", "label": "Stayed home" },
              { "value": "museum", "label": "Museum" },
              { "value": "park", "label": "Park" },
              { "value": "library", "label": "Library" },
              { "value": "store", "label": "Store" },
              { "value": "mall", "label": "Mall" },
              { "value": "restaurant", "label": "Restaurant" },
              { "value": "community_center", "label": "Community center" },
              { "value": "walk", "label": "Walk in the neighborhood" }
            ]
          },
          {
            "key": "activities",
            "type": "chips",
            "label": "What did {name} do while there?",
            "prompt_ref": 2,
            "multiple": true,
            "allow_other": true,
            "options": [
              { "value": "viewed_exhibits", "label": "Looked at exhibits" },
              { "value": "listened_to_music", "label": "Listened to music" },
              { "value": "watched_tv", "label": "Watched television" },
              { "value": "conversation", "label": "Engaged in conversation with staff" },
              { "value": "light_housekeeping", "label": "Light housekeeping" },
              { "value": "laundry", "label": "Laundry" },
              { "value": "shopping", "label": "Shopping" },
              { "value": "exercise", "label": "Exercise or a walk" },
              { "value": "games", "label": "Games or puzzles" },
              { "value": "socialized", "label": "Socialized with peers" }
            ]
          },
          {
            "key": "choice_method",
            "type": "chips",
            "label": "How did {name} choose the activity?",
            "prompt_ref": 3,
            "multiple": true,
            "options": [
              { "value": "offered_choices", "label": "Staff offered choices" },
              { "value": "requested", "label": "{name} requested it" },
              { "value": "picture_board", "label": "Used a picture board" },
              { "value": "gestured", "label": "Indicated by gesture" },
              { "value": "routine", "label": "Part of {possessive} usual routine" }
            ]
          },
          {
            "key": "enjoyment",
            "type": "chips",
            "label": "Did {subject} enjoy the activity?",
            "prompt_ref": 4,
            "multiple": false,
            "options": [
              { "value": "enjoyed", "label": "Yes, appeared to enjoy it" },
              { "value": "neutral", "label": "Neutral or unclear" },
              { "value": "did_not_enjoy", "label": "Did not appear to enjoy it", "flags_concern": true }
            ]
          }
        ]
      },
      {
        "key": "support",
        "title": "Staff support",
        "prompt_refs": [5],
        "grounding_vocabulary": ["medication", "medications"],
        "fields": [
          {
            "key": "support_provided",
            "type": "chips",
            "label": "How did staff support {name}?",
            "prompt_ref": 5,
            "multiple": true,
            "options": [
              { "value": "verbal_prompts", "label": "Verbal prompts" },
              { "value": "modeling", "label": "Modeling and demonstration" },
              { "value": "physical_assist", "label": "Hands-on assistance" },
              { "value": "transportation", "label": "Transportation" },
              { "value": "encouragement", "label": "Encouragement" },
              { "value": "supervision", "label": "Supervision only" },
              { "value": "medication_reminder", "label": "Medication reminder" }
            ]
          }
        ]
      },
      {
        "key": "status",
        "title": "Mood and concerns",
        "fields": [
          {
            "key": "mood",
            "type": "chips",
            "label": "Overall mood",
            "multiple": true,
            "options": [
              { "value": "calm", "label": "Calm" },
              { "value": "engaged", "label": "Engaged" },
              { "value": "cheerful", "label": "Cheerful" },
              { "value": "quiet", "label": "Quiet" },
              { "value": "agitated", "label": "Agitated", "flags_concern": true },
              { "value": "withdrawn", "label": "Withdrawn", "flags_concern": true }
            ]
          },
          {
            "key": "incident",
            "type": "boolean",
            "label": "Was there an incident, injury, or concern this shift?",
            "help": "If yes, describe it in the notes box. An incident report may also be required.",
            "flags_concern_when_true": true
          },
          {
            "key": "incident_detail",
            "type": "text",
            "label": "Describe the incident or concern",
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
    "header": {
      "title": "Daily Progress Note"
    },
    "footer": {
      "form_line": "Daily Progress Notes Form #680"
    },
    "narrative_min_height": 340
  }$render$::jsonb
)
on conflict (id) do nothing;
