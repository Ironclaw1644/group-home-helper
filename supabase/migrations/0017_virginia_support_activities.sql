-- Support activities, per Virginia DBHDS 2021 Person Centered ISP Guidance.
--
-- RECONSTRUCTED. ghh.outcome_activities and ghh.note_activities hold thousands
-- of live rows and are referenced throughout the app and by 0018, but no
-- `create table` for either existed anywhere in this repository —
-- ghh.note_activities_locked() was even defined in 0018 with no table to attach
-- it to. The statements below are the ones actually applied to production on
-- 2026-08-02 as `virginia_support_activities`, recovered verbatim from the
-- applied migration history. It sits before 0018 because that migration deletes
-- from both tables.
--
--
-- Virginia's structure is three levels, and the guidance states it plainly:
-- the outcome is WHERE we want to be, the support activities are WHAT we are
-- doing to get there, and the support instructions are HOW we are doing it.
--
-- The daily record is per ACTIVITY and it is a yes/no, not a rating. DBHDS's
-- own data-collection examples are literally "Did John have coffee with
-- friends? Yes/No" with staff initials, plus a separate concerns question.
-- Modelling it as a subjective progress rating would produce documentation that
-- does not answer the question a reviewer actually asks.

alter table ghh.resident_outcomes
  -- Virginia's outcome formula is:
  --   [name] [activity/important FOR] so that/in order to [important TO]
  -- Recording both halves separately lets the app help write a compliant
  -- statement instead of hoping someone remembers the formula.
  add column if not exists important_to text null,
  add column if not exists important_for text null,
  -- "by when" — every outcome in a PC ISP carries a target date.
  add column if not exists target_date date null,
  -- Which of the three lenses DBHDS asks teams to check the outcome against.
  add column if not exists lens text null
    check (lens is null or lens in ('independence', 'integration', 'quality_of_life'));

comment on column ghh.resident_outcomes.important_to is
  'What the person wants (Virginia formula: the "so that / in order to" half).';
comment on column ghh.resident_outcomes.important_for is
  'Health or behavioural need the outcome also addresses. Balances important TO.';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'activity_measure_type') then
    -- DBHDS defines exactly these three measure formulas.
    create type ghh.activity_measure_type as enum ('routine', 'skill_building', 'health_safety');
  end if;
end
$$;

create table if not exists ghh.outcome_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references ghh.organizations(id) on delete cascade,
  outcome_id uuid not null references ghh.resident_outcomes(id) on delete cascade,

  -- Activity formula: [Person's name] verb [what/when/where].
  -- "Tom uses weights at the gym."
  description text not null,

  measure_type ghh.activity_measure_type not null default 'routine',

  -- Routine:        "...two days a week"
  -- Skill-building: "Marshall says hello and his name to five people a week for three months."
  -- Health/safety:  "When Jarod's eating protocols are discontinued by a healthcare professional."
  measure text null,

  -- HOW the support is given, in this person's terms. DBHDS's example is
  -- exactly the kind of detail that never survives a generic form:
  -- "Staff gently reminds Sophie that 'it is time.' Saying 'finger stick'
  -- upsets her."
  support_instructions text null,

  -- The yes/no a DSP answers each shift. Kept as the plan's own wording so the
  -- question on screen is the question in the document.
  daily_question text null,

  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outcome_activities_outcome
  on ghh.outcome_activities (outcome_id, active, sort_order);

create table if not exists ghh.note_activities (
  note_id uuid not null references ghh.notes(id) on delete cascade,
  activity_id uuid not null references ghh.outcome_activities(id) on delete restrict,
  org_id uuid not null references ghh.organizations(id) on delete cascade,

  -- Null means the DSP has not answered yet, which is different from "no".
  completed boolean null,
  -- DBHDS pairs every data sheet with a concerns question.
  concern boolean not null default false,
  comment text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (note_id, activity_id)
);

create index if not exists note_activities_activity on ghh.note_activities (activity_id);

-- Same immutability rule as the rest of the note.
create or replace function ghh.note_activities_locked()
returns trigger
language plpgsql
security definer
set search_path = ghh, public
as $$
declare
  is_locked boolean;
begin
  select locked into is_locked from ghh.notes where id = coalesce(new.note_id, old.note_id);
  if is_locked then
    raise exception 'note % is signed; its support-activity record cannot be changed. Add an addendum instead.',
      coalesce(new.note_id, old.note_id) using errcode = 'restrict_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists note_activities_no_change_after_sign on ghh.note_activities;
create trigger note_activities_no_change_after_sign
  before insert or update or delete on ghh.note_activities
  for each row execute function ghh.note_activities_locked();

alter table ghh.outcome_activities enable row level security;
alter table ghh.note_activities enable row level security;

drop policy if exists outcome_activities_read on ghh.outcome_activities;
create policy outcome_activities_read on ghh.outcome_activities
  for select to authenticated
  using (
    org_id = ghh.auth_org()
    and exists (
      select 1 from ghh.resident_outcomes o
      join ghh.residents r on r.id = o.resident_id
      where o.id = outcome_id and ghh.can_access_home(r.home_id)
    )
  );

drop policy if exists outcome_activities_write on ghh.outcome_activities;
create policy outcome_activities_write on ghh.outcome_activities
  for all to authenticated
  using (org_id = ghh.auth_org() and ghh.is_supervisor())
  with check (org_id = ghh.auth_org() and ghh.is_supervisor());

drop policy if exists note_activities_read on ghh.note_activities;
create policy note_activities_read on ghh.note_activities
  for select to authenticated
  using (
    org_id = ghh.auth_org()
    and exists (select 1 from ghh.notes n where n.id = note_id and ghh.can_access_home(n.home_id))
  );

drop policy if exists note_activities_write on ghh.note_activities;
create policy note_activities_write on ghh.note_activities
  for all to authenticated
  using (
    org_id = ghh.auth_org()
    and exists (
      select 1 from ghh.notes n
      where n.id = note_id and ghh.can_access_home(n.home_id) and not n.locked
    )
  )
  with check (
    org_id = ghh.auth_org()
    and exists (
      select 1 from ghh.notes n
      where n.id = note_id and ghh.can_access_home(n.home_id) and not n.locked
    )
  );

grant select, insert, update, delete on ghh.outcome_activities to authenticated;
grant select, insert, update, delete on ghh.note_activities to authenticated;
grant all privileges on ghh.outcome_activities to service_role;
grant all privileges on ghh.note_activities to service_role;

notify pgrst, 'reload schema';
