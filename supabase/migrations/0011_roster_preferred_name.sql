-- Carry the preferred name and room onto the daily roster.
--
-- Without these the roster shows a legal first name the house may never use,
-- while the resident screen shows the preferred one — the same person under two
-- names in two places, which is exactly the kind of ambiguity a chart must not
-- have.
drop function if exists ghh.roster_for_date(uuid, date);

create or replace function ghh.roster_for_date(p_home_id uuid, p_service_date date)
returns table (
  resident_id uuid,
  resident_first_name text,
  resident_last_name text,
  resident_preferred_name text,
  resident_room text,
  is_demo boolean,
  shift_id uuid,
  shift_label text,
  shift_sort integer,
  note_id uuid,
  note_status ghh.note_status,
  note_updated_at timestamptz
)
language sql
stable
as $$
  select
    r.id,
    r.first_name,
    r.last_name,
    r.preferred_name,
    r.room,
    r.is_demo,
    s.id,
    s.label,
    s.sort_order,
    n.id,
    n.status,
    n.updated_at
  from ghh.residents r
  cross join ghh.shifts s
  left join ghh.notes n
    on n.resident_id = r.id
   and n.shift_id = s.id
   and n.service_date = p_service_date
  where r.home_id = p_home_id
    and r.active
    and s.home_id = p_home_id
    and s.active
  order by r.last_name, r.first_name, s.sort_order;
$$;

grant execute on function ghh.roster_for_date(uuid, date) to authenticated;
