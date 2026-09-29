-- Agency-authored outcome presets.
--
-- The starter library (0033) is content the app ships: one set per
-- jurisdiction, carried on the template row, identical for every agency in
-- that state. It stops being useful the moment an agency has its own way of
-- phrasing an outcome — the phrasing their own reviewers already accept, for
-- the people they actually support.
--
-- So an agency can now save an outcome it has already written as a reusable
-- preset, and start another person's plan from it. Same drafting aid, same
-- rule: it lands as an ordinary editable row and gets rewritten in that
-- person's own words. A preset is not a plan and not an approval of anything.
--
-- ---------------------------------------------------------------------------
-- Categories are free text, on purpose
-- ---------------------------------------------------------------------------
--
-- `category` is nullable free text, not an enum. Agencies group their work by
-- whatever they actually run — a house, a funding stream, a population, a
-- program name — and the grouping changes without a deploy. An enum here would
-- be this app guessing at a taxonomy it does not own, and every agency that
-- did not fit would have to wait for a migration. `ghh.resident_outcomes`
-- already made this call for its own category column (0015); this matches it.
--
-- ---------------------------------------------------------------------------
-- These rows are org-wide, so they must not carry a person
-- ---------------------------------------------------------------------------
--
-- A resident's outcome text contains that resident's name and pronouns. A
-- preset is readable by everyone in the organization, including staff with no
-- access to the home that person lives in. Copying an outcome here verbatim
-- would move PHI across that line quietly.
--
-- The text stored here is therefore de-personalized before it arrives:
-- `{name}`, `{subject}`, `{object}` and `{possessive}`, the same placeholders
-- `personalize()` in lib/outcomes/library.ts already expands on install. The
-- application does the substitution, shows it to the supervisor to confirm,
-- and refuses to write a row whose text still contains the source resident's
-- name. This column comment is the reminder for the next person to touch it.

create table if not exists ghh.org_outcome_presets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references ghh.organizations(id) on delete cascade,

  -- Who saved it. Nulled rather than cascaded when the profile goes, because
  -- the preset is the agency's, not the supervisor's.
  created_by uuid null references ghh.profiles(id) on delete set null,

  -- Agency-defined, free text, nullable. Presets with no category are shown in
  -- one ungrouped section rather than being forced into a bucket.
  category text null,

  title text not null,

  lens text null
    check (lens is null or lens in ('independence', 'integration', 'quality_of_life')),

  -- The outcome formula's two halves, as ghh.resident_outcomes stores them.
  important_to text null,
  important_for text null,

  -- De-personalized. `{name}` where the person was, `{subject}` / `{object}` /
  -- `{possessive}` where their pronouns were.
  statement text null,

  -- Free text ('Daily', '3x per week') for the same reason resident_outcomes
  -- keeps it free text: plans phrase this however the team wrote it.
  frequency text null,

  -- The same shape as a LibraryOutcome's activities, so a preset and a starter
  -- outcome install through one code path:
  --   [{ description, measureType, measure, supportInstructions, dailyQuestion }]
  activities jsonb not null default '[]'::jsonb
    check (jsonb_typeof(activities) = 'array'),

  -- Archived rather than deleted: a preset that produced outcomes now sitting
  -- in signed notes should stop being offered, not disappear from the record
  -- of where that wording came from.
  archived_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists org_outcome_presets_org
  on ghh.org_outcome_presets (org_id, archived_at, category, title);

comment on table ghh.org_outcome_presets is
  'Agency-authored starter outcomes, reusable across residents. De-personalized: text carries {name}/{subject}/{object}/{possessive} placeholders, never a resident name.';

comment on column ghh.org_outcome_presets.category is
  'Agency-defined free text. Deliberately not an enum — the grouping belongs to the agency, not to this app.';

comment on column ghh.org_outcome_presets.statement is
  'De-personalized outcome text. A resident name reaching this column is a PHI leak across the org boundary.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- Every predicate below opens with `org_id = ghh.auth_org()`. That is not
-- decoration. 0021 exists because a policy was written with a role check and
-- no org predicate — `profile_id = auth.uid() or ghh.is_supervisor()` — which
-- let any supervisor at any agency read every other agency's rows. A preset is
-- exactly the kind of table that invites the same mistake, because "it is just
-- template wording" is how a row full of an agency's own clinical language
-- gets treated as not worth scoping.
--
-- The read/write split is copied from ghh.resident_outcomes (0015) and
-- ghh.outcome_activities (0017): anyone in the org may read, only a supervisor
-- may write. A DSP reads presets for the same reason they read outcomes — the
-- picker sits inside a plan screen — and writes nothing.

alter table ghh.org_outcome_presets enable row level security;

drop policy if exists org_outcome_presets_read on ghh.org_outcome_presets;
create policy org_outcome_presets_read on ghh.org_outcome_presets
  for select to authenticated
  using (org_id = ghh.auth_org());

drop policy if exists org_outcome_presets_write on ghh.org_outcome_presets;
create policy org_outcome_presets_write on ghh.org_outcome_presets
  for all to authenticated
  using (org_id = ghh.auth_org() and ghh.is_supervisor())
  with check (org_id = ghh.auth_org() and ghh.is_supervisor());

grant select, insert, update, delete on ghh.org_outcome_presets to authenticated;
grant all privileges on ghh.org_outcome_presets to service_role;

notify pgrst, 'reload schema';
