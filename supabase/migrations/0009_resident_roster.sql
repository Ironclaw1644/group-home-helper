-- Resident roster management.
--
-- Residents were seed-only: the app could read them but nothing could add one,
-- so onboarding a real house meant hand-writing SQL. This adds the fields a
-- roster actually needs to stay organized once it holds more than one person,
-- plus the index that makes searching it cheap.

-- What staff actually call the person. Person-centered care language matters
-- here, and it also fixes a real narrative problem: a note about "Alexander"
-- reads as written by someone who does not know him. Nullable — falls back to
-- first_name everywhere.
alter table ghh.residents add column if not exists preferred_name text null;

-- Room or unit within the house. The obvious way to sort a roster on a shift
-- handoff, and the one piece of organizing information every house already has.
alter table ghh.residents add column if not exists room text null;

-- Free-text grouping (hall, wing, program, funding stream). Deliberately not an
-- enum: every agency organizes differently, and this app is heading toward
-- multi-tenant. Filterable in the UI.
alter table ghh.residents add column if not exists grouping text null;

-- When someone is discharged the row must stay — their signed notes reference
-- it and those are immutable records. `active = false` removes them from the
-- daily roster without deleting history.
alter table ghh.residents add column if not exists discharged_on date null;

comment on column ghh.residents.preferred_name is
  'Name staff use day to day. Falls back to first_name when null.';
comment on column ghh.residents.discharged_on is
  'Set alongside active = false. The row is never deleted — signed notes reference it.';

-- Search index. A supervisor typing into the roster filter hits this rather
-- than a sequential scan, which matters once an agency runs several houses.
create index if not exists residents_name_search
  on ghh.residents using gin (
    to_tsvector('simple',
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(preferred_name, '')
    )
  );

create index if not exists residents_home_active
  on ghh.residents (home_id, active, last_name);

-- ---------------------------------------------------------------------------
-- Bulk import support
-- ---------------------------------------------------------------------------

-- Importing a roster twice must not create duplicate people. There is no
-- natural key that is safe to rely on (two residents can share a name, and the
-- Medicaid ID is encrypted so it cannot be compared in an index), so this is a
-- soft guard the import path checks rather than a hard constraint: it flags
-- likely duplicates for the supervisor instead of silently merging records.
create or replace function ghh.find_possible_duplicate(
  p_home_id uuid,
  p_first_name text,
  p_last_name text
) returns uuid
language sql
stable
security invoker
set search_path = ghh, public
as $$
  select id
  from ghh.residents
  where home_id = p_home_id
    and lower(first_name) = lower(p_first_name)
    and lower(last_name) = lower(p_last_name)
  limit 1;
$$;

grant execute on function ghh.find_possible_duplicate(uuid, text, text) to authenticated;
