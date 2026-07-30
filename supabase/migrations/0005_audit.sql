-- Audit logging.
--
-- HIPAA expects an accounting of who touched PHI and when. Writes are captured
-- by triggers so they cannot be forgotten; reads and exports are recorded by
-- the application through ghh.log_access(), because the database cannot see a
-- SELECT's intent (or the caller's IP and user agent).

create or replace function ghh.audit_notes()
returns trigger
language plpgsql
security definer
set search_path = ghh, public, pg_temp
as $$
declare
  act text;
  rec ghh.notes;
begin
  -- Branch explicitly rather than coalescing NEW and OLD: only one of them is
  -- populated per operation, and being explicit keeps this readable when
  -- someone is reconstructing an access history under audit pressure.
  if tg_op = 'INSERT' then
    rec := new;
    act := 'note.create';
  elsif tg_op = 'DELETE' then
    rec := old;
    act := 'note.delete';
  else
    rec := new;
    act := case
      when new.status = 'signed' and old.status = 'draft' then 'note.sign'
      else 'note.update'
    end;
  end if;

  insert into ghh.audit_log (org_id, actor_id, action, entity, entity_id, detail)
  values (
    rec.org_id,
    auth.uid(),
    act,
    'note',
    rec.id,
    jsonb_build_object(
      'resident_id', rec.resident_id,
      'service_date', rec.service_date,
      'shift_id', rec.shift_id,
      'status', rec.status,
      'ai_assisted', rec.ai_assisted,
      'is_training_example', rec.is_training_example
    )
  );

  return rec;
end;
$$;

drop trigger if exists notes_audit on ghh.notes;
create trigger notes_audit
  after insert or update or delete on ghh.notes
  for each row execute function ghh.audit_notes();

create or replace function ghh.audit_addenda()
returns trigger
language plpgsql
security definer
set search_path = ghh, public, pg_temp
as $$
begin
  insert into ghh.audit_log (org_id, actor_id, action, entity, entity_id, detail)
  values (
    new.org_id, auth.uid(), 'note.addendum', 'note', new.note_id,
    jsonb_build_object('addendum_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists note_addenda_audit on ghh.note_addenda;
create trigger note_addenda_audit
  after insert on ghh.note_addenda
  for each row execute function ghh.audit_addenda();

-- ---------------------------------------------------------------------------
-- Application-driven events: viewing a note, rendering a PDF, running an
-- export, decrypting a Medicaid ID.
-- ---------------------------------------------------------------------------

create or replace function ghh.log_access(
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_detail jsonb default '{}'::jsonb,
  p_ip text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ghh, public, pg_temp
as $$
begin
  insert into ghh.audit_log (org_id, actor_id, action, entity, entity_id, detail, ip, user_agent)
  values (
    ghh.auth_org(),
    auth.uid(),
    p_action,
    p_entity,
    p_entity_id,
    coalesce(p_detail, '{}'::jsonb),
    nullif(p_ip, '')::inet,
    p_user_agent
  );
end;
$$;

grant execute on function ghh.log_access(text, text, uuid, jsonb, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Roster view: one row per resident × active shift for a given date, with the
-- note's status if one exists. This is what the DSP home screen reads, and it
-- is the query that answers "which shifts are missing a note today".
--
-- It is a function rather than a view so the date is a parameter and RLS on
-- the underlying tables still applies (SECURITY INVOKER is the default).
-- ---------------------------------------------------------------------------

create or replace function ghh.roster_for_date(p_home_id uuid, p_service_date date)
returns table (
  resident_id uuid,
  resident_first_name text,
  resident_last_name text,
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
  order by r.first_name, r.last_name, s.sort_order;
$$;

grant execute on function ghh.roster_for_date(uuid, date) to authenticated;
