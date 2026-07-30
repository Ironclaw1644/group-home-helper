-- Row Level Security.
--
-- Access model:
--   dsp        -> only residents/notes in homes assigned via staff_homes
--   supervisor -> everything in their organization
--   admin      -> everything in their organization, plus staff management
--
-- Every policy is scoped by org_id first, then by role. A DSP with no
-- staff_homes rows sees nothing, which is the correct default for a new hire.
--
-- The helper functions are SECURITY DEFINER on purpose: they read ghh.profiles,
-- and a policy on ghh.profiles that called a non-definer helper reading
-- ghh.profiles would recurse infinitely.
--
-- Identity comes from `app.user_id`, a transaction-local setting applied by
-- lib/db/client.ts before any request-scoped query. When it is unset every
-- policy evaluates false, so an unauthenticated connection sees nothing rather
-- than everything.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function ghh.auth_org()
returns uuid
language sql
stable
security definer
set search_path = ghh, public, pg_temp
as $$
  select org_id from ghh.profiles where id = ghh.current_user_id() and active;
$$;

create or replace function ghh.auth_role()
returns ghh.staff_role
language sql
stable
security definer
set search_path = ghh, public, pg_temp
as $$
  select role from ghh.profiles where id = ghh.current_user_id() and active;
$$;

create or replace function ghh.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = ghh, public, pg_temp
as $$
  select coalesce(
    (select role in ('supervisor', 'admin') from ghh.profiles where id = ghh.current_user_id() and active),
    false
  );
$$;

-- True when the caller may see this home: supervisors/admins see every home in
-- their org; a DSP must have an explicit staff_homes assignment.
create or replace function ghh.can_access_home(target_home uuid)
returns boolean
language sql
stable
security definer
set search_path = ghh, public, pg_temp
as $$
  select exists (
    select 1
    from ghh.homes h
    join ghh.profiles p on p.id = ghh.current_user_id() and p.active and p.org_id = h.org_id
    where h.id = target_home
      and (
        p.role in ('supervisor', 'admin')
        or exists (
          select 1 from ghh.staff_homes sh
          where sh.profile_id = p.id and sh.home_id = h.id
        )
      )
  );
$$;

grant execute on function ghh.auth_org(), ghh.auth_role(), ghh.is_supervisor(),
  ghh.can_access_home(uuid) to ghh_app;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. Nothing is readable until a policy says so.
-- ---------------------------------------------------------------------------

alter table ghh.organizations  enable row level security;
alter table ghh.homes          enable row level security;
alter table ghh.profiles       enable row level security;
alter table ghh.staff_homes    enable row level security;
alter table ghh.residents      enable row level security;
alter table ghh.shifts         enable row level security;
alter table ghh.form_templates enable row level security;
alter table ghh.notes          enable row level security;
alter table ghh.note_addenda   enable row level security;
alter table ghh.ai_generations enable row level security;
alter table ghh.audit_log      enable row level security;

-- Force RLS even for the table owner, so a mistake in server code cannot
-- silently read across tenants.
alter table ghh.residents    force row level security;
alter table ghh.notes        force row level security;
alter table ghh.note_addenda force row level security;

-- ---------------------------------------------------------------------------
-- Organizations / homes / shifts — read-only reference data for staff
-- ---------------------------------------------------------------------------

drop policy if exists org_read on ghh.organizations;
create policy org_read on ghh.organizations
  for select to ghh_app
  using (id = ghh.auth_org());

drop policy if exists homes_read on ghh.homes;
create policy homes_read on ghh.homes
  for select to ghh_app
  using (org_id = ghh.auth_org() and ghh.can_access_home(id));

drop policy if exists shifts_read on ghh.shifts;
create policy shifts_read on ghh.shifts
  for select to ghh_app
  using (org_id = ghh.auth_org() and ghh.can_access_home(home_id));

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

-- Everyone sees themselves; supervisors and admins see their org's staff.
drop policy if exists profiles_read on ghh.profiles;
create policy profiles_read on ghh.profiles
  for select to ghh_app
  using (id = ghh.current_user_id() or (org_id = ghh.auth_org() and ghh.is_supervisor()));

-- Staff may edit their own display name only. Role, org, and active status are
-- deliberately not self-editable — that would be a privilege-escalation path.
drop policy if exists profiles_self_update on ghh.profiles;
create policy profiles_self_update on ghh.profiles
  for update to ghh_app
  using (id = ghh.current_user_id())
  with check (
    id = ghh.current_user_id()
    and org_id = ghh.auth_org()
    and role = ghh.auth_role()
    and active
  );

drop policy if exists staff_homes_read on ghh.staff_homes;
create policy staff_homes_read on ghh.staff_homes
  for select to ghh_app
  using (profile_id = ghh.current_user_id() or ghh.is_supervisor());

-- ---------------------------------------------------------------------------
-- Residents
-- ---------------------------------------------------------------------------

drop policy if exists residents_read on ghh.residents;
create policy residents_read on ghh.residents
  for select to ghh_app
  using (org_id = ghh.auth_org() and ghh.can_access_home(home_id));

drop policy if exists residents_write on ghh.residents;
create policy residents_write on ghh.residents
  for all to ghh_app
  using (org_id = ghh.auth_org() and ghh.is_supervisor())
  with check (org_id = ghh.auth_org() and ghh.is_supervisor());

-- ---------------------------------------------------------------------------
-- Form templates — global templates (org_id is null) are visible to everyone
-- ---------------------------------------------------------------------------

drop policy if exists form_templates_read on ghh.form_templates;
create policy form_templates_read on ghh.form_templates
  for select to ghh_app
  using (active and (org_id is null or org_id = ghh.auth_org()));

-- ---------------------------------------------------------------------------
-- Notes
--
-- Read: any note in a home the caller can access.
-- Insert: the caller must be the author, in an accessible home, and may only
--         create drafts (signing is a separate, server-mediated step).
-- Update: only the author, only while unlocked. 0003 enforces immutability at
--         the row level as well, so a signed note cannot be edited even by a
--         supervisor or by server code that forgets to check.
-- Delete: drafts only, by their author. Signed notes are part of the record.
-- ---------------------------------------------------------------------------

drop policy if exists notes_read on ghh.notes;
create policy notes_read on ghh.notes
  for select to ghh_app
  using (org_id = ghh.auth_org() and ghh.can_access_home(home_id));

drop policy if exists notes_insert on ghh.notes;
create policy notes_insert on ghh.notes
  for insert to ghh_app
  with check (
    org_id = ghh.auth_org()
    and ghh.can_access_home(home_id)
    and author_id = ghh.current_user_id()
    and status = 'draft'
    and not locked
  );

drop policy if exists notes_update on ghh.notes;
create policy notes_update on ghh.notes
  for update to ghh_app
  using (
    org_id = ghh.auth_org()
    and ghh.can_access_home(home_id)
    and author_id = ghh.current_user_id()
    and not locked
  )
  with check (
    org_id = ghh.auth_org()
    and ghh.can_access_home(home_id)
    and author_id = ghh.current_user_id()
  );

drop policy if exists notes_delete_draft on ghh.notes;
create policy notes_delete_draft on ghh.notes
  for delete to ghh_app
  using (
    org_id = ghh.auth_org()
    and author_id = ghh.current_user_id()
    and status = 'draft'
    and not locked
  );

-- ---------------------------------------------------------------------------
-- Addenda — append-only by design. No update or delete policy exists, so those
-- operations are denied for every authenticated user.
-- ---------------------------------------------------------------------------

drop policy if exists note_addenda_read on ghh.note_addenda;
create policy note_addenda_read on ghh.note_addenda
  for select to ghh_app
  using (
    exists (
      select 1 from ghh.notes n
      where n.id = note_id
        and n.org_id = ghh.auth_org()
        and ghh.can_access_home(n.home_id)
    )
  );

drop policy if exists note_addenda_insert on ghh.note_addenda;
create policy note_addenda_insert on ghh.note_addenda
  for insert to ghh_app
  with check (
    author_id = ghh.current_user_id()
    and exists (
      select 1 from ghh.notes n
      where n.id = note_id
        and n.org_id = ghh.auth_org()
        and ghh.can_access_home(n.home_id)
        -- An addendum only makes sense against a signed note.
        and n.status = 'signed'
    )
  );

-- ---------------------------------------------------------------------------
-- AI generations — readable for transparency, written server-side only
-- ---------------------------------------------------------------------------

drop policy if exists ai_generations_read on ghh.ai_generations;
create policy ai_generations_read on ghh.ai_generations
  for select to ghh_app
  using (org_id = ghh.auth_org() and ghh.is_supervisor());

-- ---------------------------------------------------------------------------
-- Audit log — supervisors read, nobody writes through the client
-- ---------------------------------------------------------------------------

drop policy if exists audit_log_read on ghh.audit_log;
create policy audit_log_read on ghh.audit_log
  for select to ghh_app
  using (org_id = ghh.auth_org() and ghh.is_supervisor());

-- Table privileges live in 0001 alongside the tables themselves.
