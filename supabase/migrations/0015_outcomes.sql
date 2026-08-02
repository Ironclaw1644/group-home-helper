-- ISP outcomes: the reason every resident's note page is different.
--
-- In HCBS/waiver services each person has an Individual Service Plan built
-- around personally-meaningful **outcomes** — what this person is working
-- toward, in their own terms. "Alex will prepare his own breakfast three
-- mornings a week." "Maria will choose and attend one community activity a
-- week." They are not a fixed checklist; they are different for every person
-- and they change at plan review.
--
-- This matters for billing, not just for care. A Medicaid auditor reviewing a
-- day of service asks: does the documentation show progress toward this
-- person's plan? A note reading "had a good day, watched TV" is an audit
-- finding no matter how neatly it is signed, because it ties to nothing in the
-- plan. A note that records which outcomes were worked on, what support was
-- given, and how the person responded is what makes the day defensible.
--
-- So the daily note form is assembled per resident: the shared Form #680
-- sections, plus that person's own outcomes.

create table if not exists ghh.resident_outcomes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references ghh.organizations(id) on delete cascade,
  resident_id uuid not null references ghh.residents(id) on delete cascade,

  -- Short label, used as the section heading on the note form.
  title text not null,

  -- The outcome as written in the ISP. Kept verbatim: an auditor comparing the
  -- note to the plan should find the same words.
  statement text null,

  -- How staff are meant to support it. Shown to the DSP while documenting, so
  -- the strategy is in front of them at the moment they need it.
  support_strategies text null,

  -- What counts as progress, from the plan.
  measure text null,

  -- Free text ('daily', '3x per week') rather than an enum: plans phrase this
  -- however the team wrote it, and forcing it into categories would misquote
  -- the document.
  frequency text null,

  -- Grouping used by the agency: 'Community', 'Daily living', 'Health',
  -- 'Communication'. Agency-defined, since taxonomies differ by state.
  category text null,

  sort_order integer not null default 0,
  active boolean not null default true,

  -- Plans have terms. An outcome retired at plan review must stay readable,
  -- because notes already reference it.
  started_on date null,
  ended_on date null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists resident_outcomes_resident
  on ghh.resident_outcomes (resident_id, active, sort_order);

comment on table ghh.resident_outcomes is
  'Per-resident ISP outcomes. Drives what the daily note form asks about, which is why every resident sees a different page.';

-- ---------------------------------------------------------------------------
-- What was documented against each outcome, per note
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'outcome_support_level') then
    create type ghh.outcome_support_level as enum (
      'independent', 'verbal_prompt', 'gestural_prompt', 'hands_on', 'full_support'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'outcome_progress') then
    create type ghh.outcome_progress as enum (
      'progressed', 'maintained', 'regressed', 'declined', 'not_addressed'
    );
  end if;
end
$$;

create table if not exists ghh.note_outcomes (
  note_id uuid not null references ghh.notes(id) on delete cascade,
  outcome_id uuid not null references ghh.resident_outcomes(id) on delete restrict,
  org_id uuid not null references ghh.organizations(id) on delete cascade,

  -- False means the outcome was not worked on this shift. That is a legitimate
  -- and sometimes important thing to record — a run of "not addressed" is the
  -- signal a supervisor needs, so it is stored rather than left blank.
  addressed boolean not null default false,

  support_level ghh.outcome_support_level null,
  progress ghh.outcome_progress null,

  -- What actually happened. Grounding input for the narrative, exactly like the
  -- chips: the model may describe this and nothing beyond it.
  comment text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (note_id, outcome_id)
);

create index if not exists note_outcomes_outcome on ghh.note_outcomes (outcome_id);

comment on table ghh.note_outcomes is
  'Per-note documentation against one ISP outcome. Locked when the note is signed — it is part of the record, not an annotation on it.';

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------

-- Outcome entries are part of the signed note. Letting them change after
-- signing would leave a locked narrative describing progress that the
-- structured record no longer shows — which is worse than either being wrong
-- on its own, because the two would disagree.
create or replace function ghh.note_outcomes_locked()
returns trigger
language plpgsql
security definer
set search_path = ghh, public
as $$
declare
  is_locked boolean;
begin
  select locked into is_locked
  from ghh.notes
  where id = coalesce(new.note_id, old.note_id);

  if is_locked then
    raise exception 'note % is signed; its outcome documentation cannot be changed. Add an addendum instead.',
      coalesce(new.note_id, old.note_id)
      using errcode = 'restrict_violation';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists note_outcomes_no_change_after_sign on ghh.note_outcomes;
create trigger note_outcomes_no_change_after_sign
  before insert or update or delete on ghh.note_outcomes
  for each row execute function ghh.note_outcomes_locked();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table ghh.resident_outcomes enable row level security;
alter table ghh.note_outcomes enable row level security;

-- A DSP must READ outcomes — they cannot document against a plan they cannot
-- see, and the support strategies are the point.
drop policy if exists resident_outcomes_read on ghh.resident_outcomes;
create policy resident_outcomes_read on ghh.resident_outcomes
  for select to authenticated
  using (
    org_id = ghh.auth_org()
    and exists (
      select 1 from ghh.residents r
      where r.id = resident_id and ghh.can_access_home(r.home_id)
    )
  );

-- Only a supervisor edits the plan. An outcome is a clinical document written
-- by the planning team; a DSP documenting a shift must not be able to reword
-- what they are being measured against.
drop policy if exists resident_outcomes_write on ghh.resident_outcomes;
create policy resident_outcomes_write on ghh.resident_outcomes
  for all to authenticated
  using (org_id = ghh.auth_org() and ghh.is_supervisor())
  with check (org_id = ghh.auth_org() and ghh.is_supervisor());

-- Note entries follow the note: whoever may write the note may document
-- against its outcomes.
drop policy if exists note_outcomes_read on ghh.note_outcomes;
create policy note_outcomes_read on ghh.note_outcomes
  for select to authenticated
  using (
    org_id = ghh.auth_org()
    and exists (
      select 1 from ghh.notes n
      where n.id = note_id and ghh.can_access_home(n.home_id)
    )
  );

drop policy if exists note_outcomes_write on ghh.note_outcomes;
create policy note_outcomes_write on ghh.note_outcomes
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

grant select, insert, update, delete on ghh.resident_outcomes to authenticated;
grant select, insert, update, delete on ghh.note_outcomes to authenticated;
grant all privileges on ghh.resident_outcomes to service_role;
grant all privileges on ghh.note_outcomes to service_role;

-- ---------------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------------

/**
 * Progress against one resident's outcomes over a date range.
 *
 * This is the query a supervisor runs before a plan review, and the one an
 * auditor effectively performs by hand. SECURITY INVOKER so RLS still applies.
 */
create or replace function ghh.outcome_progress_summary(
  p_resident_id uuid,
  p_from date,
  p_to date
)
returns table (
  outcome_id uuid,
  title text,
  statement text,
  frequency text,
  times_addressed bigint,
  times_not_addressed bigint,
  progressed bigint,
  maintained bigint,
  regressed bigint,
  declined bigint,
  last_addressed date
)
language sql
stable
security invoker
set search_path = ghh, public
as $$
  select
    o.id,
    o.title,
    o.statement,
    o.frequency,
    count(*) filter (where no.addressed),
    count(*) filter (where no.note_id is not null and not no.addressed),
    count(*) filter (where no.progress = 'progressed'),
    count(*) filter (where no.progress = 'maintained'),
    count(*) filter (where no.progress = 'regressed'),
    count(*) filter (where no.progress = 'declined'),
    max(n.service_date) filter (where no.addressed)
  from ghh.resident_outcomes o
  left join ghh.note_outcomes no on no.outcome_id = o.id
  left join ghh.notes n
    on n.id = no.note_id
   and n.service_date between p_from and p_to
   and n.status = 'signed'
  where o.resident_id = p_resident_id
    and o.active
  group by o.id, o.title, o.statement, o.frequency, o.sort_order
  order by o.sort_order, o.title;
$$;

grant execute on function ghh.outcome_progress_summary(uuid, date, date) to authenticated;
