-- Outcome vocabulary moves out of TypeScript and into the template.
--
-- `lib/outcomes/virginia-library.ts` exported VIRGINIA_OUTCOME_LIBRARY as a
-- const array, imported directly by the install route, by demo provisioning,
-- by a verification script, and — worst — by a CLIENT component, so every
-- customer downloaded Virginia's vocabulary in their browser bundle whatever
-- state they were in. Adding Ohio's starter plans meant editing a module and
-- redeploying, which is exactly what "adding a state is content authoring"
-- rules out.
--
-- So the library becomes `schema.outcome_library` on the template row. One
-- INSERT now carries a jurisdiction's whole form: its prompts, its sections,
-- its printed layout, its signature block, AND its starter plans.
--
-- ---------------------------------------------------------------------------
-- What these are, and what they are not
-- ---------------------------------------------------------------------------
--
-- A DRAFTING AID. They land as ordinary editable rows so a supervisor rewrites
-- them in the person's own words. A template outcome is by definition not
-- person-centered, and every one of these must be rewritten before it goes in
-- a chart. Virginia has cited providers for exactly this. Nothing below is a
-- regulatory requirement or a state-issued plan.
--
-- `{name}`, `{subject}`, `{object}` and `{possessive}` are filled with the
-- resident's own name and pronouns on install.
--
-- ---------------------------------------------------------------------------
-- Virginia
-- ---------------------------------------------------------------------------
--
-- Copied VERBATIM from lib/outcomes/virginia-library.ts as it stood at
-- 7d06e00 — same six outcomes, same eleven activities, same wording. This
-- migration moves the data; it does not revise it. Shaped to DBHDS "2021
-- Person Centered ISP Guidance" (rev 6.7.21): the outcome formula
-- [name] [activity/important FOR] so that [important TO], the activity formula
-- [name] verb [what/when/where], and the three measure kinds.
--
-- ---------------------------------------------------------------------------
-- Ohio
-- ---------------------------------------------------------------------------
--
-- Written against the service components Ohio names in its own definition of
-- homemaker/personal care, OAC 5123-9-30(B)(11)(a)-(i) — daily living skills,
-- self-direction, community access, medical and health care, and assistance
-- with personal finances. The COMPONENTS are the state's. The wording of these
-- outcomes is this app's, and carries no more authority than the Virginia set
-- does.
--
-- ---------------------------------------------------------------------------
-- GENERIC
-- ---------------------------------------------------------------------------
--
-- A state-neutral subset, so an agency in an unauthored state still starts
-- from something rather than an empty box. Names no jurisdiction.

-- Virginia — verbatim from the TypeScript module it replaces.
update ghh.form_templates
   set schema = jsonb_set(schema, '{outcome_library}', $lib$[
    {
        "key": "community_outing",
        "title": "Getting out in the community",
        "lens": "integration",
        "importantTo": "Being out where things are happening",
        "statement": "{name} goes somewhere in the community weekly in order to be part of what is happening nearby.",
        "frequency": "Weekly",
        "activities": [
            {
                "description": "{name} chooses where to go from two or more options.",
                "measureType": "skill_building",
                "measure": "{name} makes the choice unprompted once a week for three months.",
                "supportInstructions": "Offer two options out loud and in pictures. Wait — do not fill the silence. If there is no answer after a minute, offer the two again rather than choosing.",
                "dailyQuestion": "Did {name} choose where to go?"
            },
            {
                "description": "{name} goes on the outing with staff support.",
                "measureType": "routine",
                "measure": "Once a week.",
                "supportInstructions": "Travel the route {name} already knows. Leave before it gets busy if crowds are hard that day.",
                "dailyQuestion": "Did {name} go on an outing today?"
            }
        ]
    },
    {
        "key": "meal_preparation",
        "title": "Cooking for myself",
        "lens": "independence",
        "importantTo": "Making my own food the way I like it",
        "statement": "{name} prepares a simple meal three times a week in order to make {possessive} own food.",
        "frequency": "3x per week",
        "activities": [
            {
                "description": "{name} prepares a simple meal in the kitchen.",
                "measureType": "skill_building",
                "measure": "{name} completes four of the five steps without a prompt, three times a week for two months.",
                "supportInstructions": "Set out the ingredients first. Stand back and let {name} start. Hand-over-hand only at the stove.",
                "dailyQuestion": "Did {name} prepare a meal today?"
            },
            {
                "description": "{name} puts away the things used.",
                "measureType": "routine",
                "measure": "After each meal.",
                "supportInstructions": "Name one item at a time rather than saying \"clean up\".",
                "dailyQuestion": "Did {name} put things away afterwards?"
            }
        ]
    },
    {
        "key": "friendships",
        "title": "Seeing people I like",
        "lens": "integration",
        "importantTo": "Having friends and people to talk to",
        "statement": "{name} spends time with a person of {possessive} choosing weekly in order to keep up {possessive} friendships.",
        "frequency": "Weekly",
        "activities": [
            {
                "description": "{name} contacts a friend or family member.",
                "measureType": "routine",
                "measure": "At least once a week.",
                "supportInstructions": "Offer the phone and the contact list. {name} decides who and whether — do not suggest a name.",
                "dailyQuestion": "Did {name} contact someone today?"
            },
            {
                "description": "{name} greets people along the way.",
                "measureType": "skill_building",
                "measure": "{name} greets three people a week for three months.",
                "supportInstructions": "Model the greeting once, then step back and let it happen.",
                "dailyQuestion": "Did {name} greet someone today?"
            }
        ]
    },
    {
        "key": "personal_care",
        "title": "Getting ready my own way",
        "lens": "independence",
        "importantTo": "Looking the way I want to look",
        "statement": "{name} completes {possessive} morning routine daily in order to look {possessive} own way.",
        "frequency": "Daily",
        "activities": [
            {
                "description": "{name} completes {possessive} morning routine.",
                "measureType": "skill_building",
                "measure": "{name} completes the routine with verbal prompts only, daily for one month.",
                "supportInstructions": "Prompt one step at a time in the same order every morning. Do not do a step for {name} that {subject} started.",
                "dailyQuestion": "Did {name} complete the morning routine?"
            },
            {
                "description": "{name} picks out {possessive} own clothes.",
                "measureType": "routine",
                "measure": "Daily.",
                "supportInstructions": "Lay out two options if the full wardrobe is overwhelming. The choice is {possessive}, including when it does not match.",
                "dailyQuestion": "Did {name} choose {possessive} own clothes?"
            }
        ]
    },
    {
        "key": "health_routine",
        "title": "Staying well",
        "lens": "quality_of_life",
        "importantTo": "Feeling good and doing what I want to do",
        "importantFor": "Following the health protocol in the plan",
        "statement": "{name} follows {possessive} health routine each day in order to feel well enough for the things {possessive} day holds.",
        "frequency": "Daily",
        "activities": [
            {
                "description": "{name} takes part in {possessive} health routine as written in the protocol.",
                "measureType": "health_safety",
                "measure": "When the prescribing clinician discontinues the protocol.",
                "supportInstructions": "Follow the attached protocol exactly. Explain each step before doing it. Record concerns in the note, not just the checkbox.",
                "dailyQuestion": "Was {name}’s health routine followed as written?"
            },
            {
                "description": "Staff check for anything new or concerning.",
                "measureType": "health_safety",
                "measure": "Ongoing while the protocol is in place.",
                "supportInstructions": "If anything is different from usual, write what was seen — not what it might mean.",
                "dailyQuestion": "Were any concerns noted today?"
            }
        ]
    },
    {
        "key": "money",
        "title": "Handling my own money",
        "lens": "independence",
        "importantTo": "Buying what I want without asking",
        "statement": "{name} makes a purchase weekly in order to buy things without having to ask.",
        "frequency": "Weekly",
        "activities": [
            {
                "description": "{name} pays for an item in a shop.",
                "measureType": "skill_building",
                "measure": "{name} completes a purchase weekly for two months.",
                "supportInstructions": "Let {name} hand over the money and take the change. Wait before stepping in — the cashier can wait too.",
                "dailyQuestion": "Did {name} make a purchase today?"
            }
        ]
    }
]$lib$::jsonb, true),
       updated_at = now()
 where key = 'daily_progress_note_680';

-- Ohio — shaped to the service components at OAC 5123-9-30(B)(11).
update ghh.form_templates
   set schema = jsonb_set(schema, '{outcome_library}', $lib$[
    {
        "key": "daily_living_skills",
        "title": "Looking after my own place",
        "lens": "independence",
        "importantTo": "Keeping my room the way I like it",
        "statement": "{name} completes one household task daily in order to keep {possessive} own space the way {name} likes it.",
        "frequency": "Daily",
        "activities": [
            {
                "description": "{name} does one household task of {possessive} choosing.",
                "measureType": "routine",
                "measure": "One task a day.",
                "supportInstructions": "Offer the choice of task. Do not tidy ahead of {object} — the task has to still be there to do.",
                "dailyQuestion": "Did {name} do a household task today?"
            }
        ]
    },
    {
        "key": "self_direction",
        "title": "Making my own decisions",
        "lens": "independence",
        "importantTo": "Being asked, not told",
        "statement": "{name} makes at least two choices about {possessive} own day, every day, in order to be asked rather than told.",
        "frequency": "Daily",
        "activities": [
            {
                "description": "{name} chooses what to wear and what to eat.",
                "measureType": "skill_building",
                "measure": "{name} chooses unprompted on five days out of seven, for two months.",
                "supportInstructions": "Offer two real options, out loud and in pictures. Wait. If there is no answer after a minute, offer the two again rather than choosing.",
                "dailyQuestion": "Did {name} choose what to wear or eat?"
            }
        ]
    },
    {
        "key": "community_access",
        "title": "Getting out where things are happening",
        "lens": "integration",
        "importantTo": "Being part of what goes on nearby",
        "statement": "{name} goes somewhere in the community weekly in order to be part of what is happening nearby.",
        "frequency": "Weekly",
        "activities": [
            {
                "description": "{name} chooses where to go from two or more options.",
                "measureType": "skill_building",
                "measure": "{name} makes the choice unprompted once a week for three months.",
                "supportInstructions": "Offer two options out loud and in pictures. Wait — do not fill the silence.",
                "dailyQuestion": "Did {name} choose where to go?"
            },
            {
                "description": "{name} goes on the outing with staff support.",
                "measureType": "routine",
                "measure": "Once a week.",
                "supportInstructions": "Drive or ride alongside. Let {object} lead once you are there.",
                "dailyQuestion": "Did {name} go out today?"
            }
        ]
    },
    {
        "key": "health_routine",
        "title": "Looking after my health",
        "lens": "independence",
        "importantTo": "Feeling well enough to do what I want",
        "importantFor": "Following the health protocols written into the plan",
        "statement": "{name} takes part in {possessive} own health routine daily in order to feel well enough to do what {name} wants.",
        "frequency": "Daily",
        "activities": [
            {
                "description": "{name} takes medication with staff support.",
                "measureType": "health_safety",
                "measure": "Support continues until the prescriber discontinues the protocol.",
                "supportInstructions": "Hand {object} the medication and the water. Stay until it is taken. Record a refusal as a refusal — do not try again and record the second attempt.",
                "dailyQuestion": "Did {name} take {possessive} medication as prescribed?"
            }
        ]
    },
    {
        "key": "personal_finances",
        "title": "Handling my own money",
        "lens": "independence",
        "importantTo": "Buying what I want without asking",
        "statement": "{name} makes a purchase weekly in order to buy things without having to ask.",
        "frequency": "Weekly",
        "activities": [
            {
                "description": "{name} pays for an item in a shop.",
                "measureType": "skill_building",
                "measure": "{name} completes a purchase weekly for two months.",
                "supportInstructions": "Let {name} hand over the money and take the change. Wait before stepping in — the cashier can wait too.",
                "dailyQuestion": "Did {name} make a purchase today?"
            }
        ]
    }
]$lib$::jsonb, true),
       updated_at = now()
 where key = 'service_documentation_hpc_oh';

-- GENERIC — state-neutral subset.
update ghh.form_templates
   set schema = jsonb_set(schema, '{outcome_library}', $lib$[
    {
        "key": "daily_living_skills",
        "title": "Looking after my own place",
        "lens": "independence",
        "importantTo": "Keeping my room the way I like it",
        "statement": "{name} completes one household task daily in order to keep {possessive} own space the way {name} likes it.",
        "frequency": "Daily",
        "activities": [
            {
                "description": "{name} does one household task of {possessive} choosing.",
                "measureType": "routine",
                "measure": "One task a day.",
                "supportInstructions": "Offer the choice of task. Do not tidy ahead of {object} — the task has to still be there to do.",
                "dailyQuestion": "Did {name} do a household task today?"
            }
        ]
    },
    {
        "key": "self_direction",
        "title": "Making my own decisions",
        "lens": "independence",
        "importantTo": "Being asked, not told",
        "statement": "{name} makes at least two choices about {possessive} own day, every day, in order to be asked rather than told.",
        "frequency": "Daily",
        "activities": [
            {
                "description": "{name} chooses what to wear and what to eat.",
                "measureType": "skill_building",
                "measure": "{name} chooses unprompted on five days out of seven, for two months.",
                "supportInstructions": "Offer two real options, out loud and in pictures. Wait. If there is no answer after a minute, offer the two again rather than choosing.",
                "dailyQuestion": "Did {name} choose what to wear or eat?"
            }
        ]
    },
    {
        "key": "community_access",
        "title": "Getting out where things are happening",
        "lens": "integration",
        "importantTo": "Being part of what goes on nearby",
        "statement": "{name} goes somewhere in the community weekly in order to be part of what is happening nearby.",
        "frequency": "Weekly",
        "activities": [
            {
                "description": "{name} chooses where to go from two or more options.",
                "measureType": "skill_building",
                "measure": "{name} makes the choice unprompted once a week for three months.",
                "supportInstructions": "Offer two options out loud and in pictures. Wait — do not fill the silence.",
                "dailyQuestion": "Did {name} choose where to go?"
            },
            {
                "description": "{name} goes on the outing with staff support.",
                "measureType": "routine",
                "measure": "Once a week.",
                "supportInstructions": "Drive or ride alongside. Let {object} lead once you are there.",
                "dailyQuestion": "Did {name} go out today?"
            }
        ]
    },
    {
        "key": "personal_finances",
        "title": "Handling my own money",
        "lens": "independence",
        "importantTo": "Buying what I want without asking",
        "statement": "{name} makes a purchase weekly in order to buy things without having to ask.",
        "frequency": "Weekly",
        "activities": [
            {
                "description": "{name} pays for an item in a shop.",
                "measureType": "skill_building",
                "measure": "{name} completes a purchase weekly for two months.",
                "supportInstructions": "Let {name} hand over the money and take the change. Wait before stepping in — the cashier can wait too.",
                "dailyQuestion": "Did {name} make a purchase today?"
            }
        ]
    }
]$lib$::jsonb, true),
       updated_at = now()
 where key = 'daily_progress_note_generic';

-- Every template must now carry a library, or the "start from the library"
-- affordance silently disappears for that jurisdiction.
do $$
declare missing text;
begin
  select string_agg(key, ', ') into missing
    from ghh.form_templates
   where active and not (schema ? 'outcome_library');
  if missing is not null then
    raise exception 'form templates with no outcome_library: %', missing;
  end if;
end
$$;
