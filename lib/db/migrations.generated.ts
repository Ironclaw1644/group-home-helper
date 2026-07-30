// GENERATED FILE — do not edit.
// Source: db/migrations/*.sql
// Regenerate with: npm run db:bundle

export type Migration = { name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    name: "0001_schema.sql",
    sql: `-- Group Home Helper — core schema.
--
-- Everything lives in the \`ghh\` schema and carries \`org_id\`. There is one
-- organization today (At Home Family Services); the column exists from day one
-- so onboarding a second agency is an INSERT, not a migration.
--
-- This database holds PHI. It runs embedded on the operator's own machine, so
-- nothing here is reachable from a network by default. RLS is enabled in 0002;
-- nothing in this file grants blanket access.
--
-- This is standard PostgreSQL. It runs identically on an embedded PGlite
-- instance and on a hosted Postgres, which keeps a future hosted deployment a
-- connection-string change rather than a rewrite.

create extension if not exists "pgcrypto";

create schema if not exists ghh;

-- The unprivileged role every request-scoped query runs as. It deliberately
-- has no BYPASSRLS, which is what makes the policies in 0002 binding.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ghh_app') then
    create role ghh_app nologin;
  end if;
end;
$$;

grant usage on schema ghh to ghh_app;

-- ---------------------------------------------------------------------------
-- Identity
--
-- Replaces Supabase's auth.users. Sign-in is handled by the app: bcrypt hash
-- here, signed session cookie there. \`ghh.current_user_id()\` is the local
-- equivalent of auth.uid() and is what every policy keys off.
-- ---------------------------------------------------------------------------

create table if not exists ghh.users (
  id uuid primary key default gen_random_uuid(),
  -- Stored lowercased by the app so uniqueness is case-insensitive without
  -- pulling in the citext extension.
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function ghh.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

grant execute on function ghh.current_user_id() to ghh_app;

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function ghh.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------

create table if not exists ghh.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text null,
  medicaid_provider_id text null,
  logo_url text null,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ghh.homes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references ghh.organizations(id) on delete cascade,
  name text not null,
  address text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists homes_org_idx on ghh.homes(org_id);

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type t
                 join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'staff_role' and n.nspname = 'ghh') then
    create type ghh.staff_role as enum ('dsp', 'supervisor', 'admin');
  end if;
end;
$$;

create table if not exists ghh.profiles (
  id uuid primary key references ghh.users(id) on delete cascade,
  org_id uuid not null references ghh.organizations(id) on delete cascade,
  full_name text not null,
  -- Printed on the signature line of every note this person signs.
  title text not null default 'DSP',
  role ghh.staff_role not null default 'dsp',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_org_idx on ghh.profiles(org_id);

-- Which houses a staff member may see. A DSP with no rows here sees nothing;
-- that is the intended default for a newly created account.
create table if not exists ghh.staff_homes (
  profile_id uuid not null references ghh.profiles(id) on delete cascade,
  home_id uuid not null references ghh.homes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, home_id)
);
create index if not exists staff_homes_home_idx on ghh.staff_homes(home_id);

-- ---------------------------------------------------------------------------
-- Residents
-- ---------------------------------------------------------------------------

create table if not exists ghh.residents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references ghh.organizations(id) on delete cascade,
  home_id uuid not null references ghh.homes(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  -- Encrypted at rest. Never selected directly by the browser; server code
  -- calls ghh.decrypt_medicaid_id() only when rendering the active note.
  medicaid_id_enc bytea null,
  -- Fictional ID for the demo resident only, so training examples can display
  -- a realistic-looking number without an encryption round-trip. The CHECK
  -- below makes it impossible to park a real ID here.
  medicaid_id_demo text null,
  dob date null,
  -- Drives pronouns in generated narrative. Never inferred from a name.
  pronoun_subject text not null default 'they',
  pronoun_object text not null default 'them',
  pronoun_possessive text not null default 'their',
  -- Fictional resident used for AI-generated training examples. Notes about a
  -- demo resident are excluded from billing exports (no claim exists for them).
  is_demo boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A demo resident never carries real PHI; a real resident never carries a
  -- plaintext ID. Enforced rather than documented.
  constraint residents_demo_id_only_for_demo check (
    medicaid_id_demo is null or is_demo
  ),
  constraint residents_real_id_not_on_demo check (
    medicaid_id_enc is null or not is_demo
  )
);
create index if not exists residents_org_idx on ghh.residents(org_id);
create index if not exists residents_home_idx on ghh.residents(home_id) where active;

-- ---------------------------------------------------------------------------
-- Medicaid ID encryption
--
-- The key is passed in by the server on each call and is never stored in the
-- database, so ciphertext and key never live in the same place. A dump of this
-- database yields no readable Medicaid IDs.
--
-- Both RPCs are revoked from the application role below: only server code
-- running as the owner may call them, and only after it has confirmed the
-- caller may see the resident. RLS alone would not be enough here, because
-- these are the one path that turns ciphertext back into PHI.
-- ---------------------------------------------------------------------------

create or replace function ghh.read_medicaid_id(p_resident_id uuid, p_key text)
returns text
language plpgsql
security definer
set search_path = ghh, public, pg_temp
as $$
declare
  cipher bytea;
  demo_id text;
  is_demo_resident boolean;
begin
  if p_key is null or p_key = '' then
    raise exception 'encryption key is required';
  end if;

  select medicaid_id_enc, medicaid_id_demo, is_demo
    into cipher, demo_id, is_demo_resident
  from ghh.residents
  where id = p_resident_id;

  if not found then
    return null;
  end if;

  -- Demo residents carry a fictional plaintext ID so training examples can
  -- show a realistic number without a key round-trip.
  if is_demo_resident then
    return demo_id;
  end if;

  if cipher is null then
    return null;
  end if;

  return pgp_sym_decrypt(cipher, p_key);
end;
$$;

create or replace function ghh.write_medicaid_id(p_resident_id uuid, p_plain text, p_key text)
returns void
language plpgsql
security definer
set search_path = ghh, public, pg_temp
as $$
begin
  if p_key is null or p_key = '' then
    raise exception 'encryption key is required';
  end if;

  if exists (select 1 from ghh.residents where id = p_resident_id and is_demo) then
    raise exception 'cannot store an encrypted Medicaid ID on a demo resident';
  end if;

  update ghh.residents
     set medicaid_id_enc = case
           when p_plain is null or p_plain = '' then null
           else pgp_sym_encrypt(p_plain, p_key)
         end
   where id = p_resident_id;
end;
$$;

-- Not reachable by the application role. These are called only from server
-- code running as the owner, after the caller's access has been proven.
revoke all on function ghh.read_medicaid_id(uuid, text) from public, ghh_app;
revoke all on function ghh.write_medicaid_id(uuid, text, text) from public, ghh_app;

-- ---------------------------------------------------------------------------
-- Shifts
-- ---------------------------------------------------------------------------

create table if not exists ghh.shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references ghh.organizations(id) on delete cascade,
  home_id uuid not null references ghh.homes(id) on delete cascade,
  -- Printed verbatim in the "Shift/Time" field, e.g. '7AM-7PM'.
  label text not null,
  start_time time not null,
  end_time time not null,
  -- True when end_time < start_time (an overnight shift crossing midnight).
  crosses_midnight boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shifts_home_idx on ghh.shifts(home_id) where active;

-- ---------------------------------------------------------------------------
-- Form templates
--
-- Form #680 is the first template. \`schema\` describes sections and fields;
-- \`render_config\` describes the PDF layout. Adding a second form (MAR,
-- incident report) is a row here plus any new field types in the renderer.
-- ---------------------------------------------------------------------------

create table if not exists ghh.form_templates (
  id uuid primary key default gen_random_uuid(),
  -- null org_id = template available to every organization.
  org_id uuid null references ghh.organizations(id) on delete cascade,
  key text not null,
  version integer not null default 1,
  name text not null,
  form_number text null,
  schema jsonb not null,
  render_config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key, version)
);

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type t
                 join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'note_status' and n.nspname = 'ghh') then
    create type ghh.note_status as enum ('draft', 'signed');
  end if;
  if not exists (select 1 from pg_type t
                 join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'ai_mode' and n.nspname = 'ghh') then
    create type ghh.ai_mode as enum ('draft_assist', 'example');
  end if;
end;
$$;

create table if not exists ghh.notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references ghh.organizations(id) on delete cascade,
  template_id uuid not null references ghh.form_templates(id),
  template_version integer not null,

  resident_id uuid not null references ghh.residents(id) on delete restrict,
  home_id uuid not null references ghh.homes(id) on delete restrict,
  shift_id uuid not null references ghh.shifts(id) on delete restrict,
  service_date date not null,

  author_id uuid not null references ghh.profiles(id) on delete restrict,
  status ghh.note_status not null default 'draft',

  -- The chips the DSP actually tapped. This is the grounding input for
  -- Draft Assist and the audit trail for what the narrative is based on.
  structured_data jsonb not null default '{}'::jsonb,
  narrative text not null default '',

  ai_assisted boolean not null default false,
  ai_mode ghh.ai_mode null,
  -- True when the note is a training artifact about a demo resident. It looks
  -- and prints exactly like a real note; this flag only drives the app badge
  -- and exclusion from billing exports.
  is_training_example boolean not null default false,

  signed_at timestamptz null,
  signed_by uuid null references ghh.profiles(id),
  signature_image_path text null,
  signature_name text null,
  signature_title text null,
  attestation_text text null,

  -- Set true at signing. 0003 installs the trigger that makes locked rows
  -- immutable.
  locked boolean not null default false,

  -- Similarity to this resident's previous signed note (0..1). Near-duplicate
  -- notes across days are the top Medicaid audit red flag.
  similarity_prev numeric(4, 3) null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One note per resident, per shift, per day.
  unique (resident_id, shift_id, service_date),

  constraint notes_signed_fields_present check (
    status <> 'signed'
    or (signed_at is not null and signed_by is not null and signature_name is not null)
  ),
  constraint notes_signed_is_locked check (status <> 'signed' or locked)
);

create index if not exists notes_roster_idx on ghh.notes(home_id, service_date);
create index if not exists notes_resident_date_idx on ghh.notes(resident_id, service_date desc);
create index if not exists notes_org_status_idx on ghh.notes(org_id, status);

-- Corrections to a signed note are appended here. The signed note itself is
-- never edited.
create table if not exists ghh.note_addenda (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references ghh.organizations(id) on delete cascade,
  note_id uuid not null references ghh.notes(id) on delete cascade,
  author_id uuid not null references ghh.profiles(id) on delete restrict,
  body text not null,
  signature_name text not null,
  signature_title text not null,
  created_at timestamptz not null default now()
);
create index if not exists note_addenda_note_idx on ghh.note_addenda(note_id, created_at);

-- ---------------------------------------------------------------------------
-- AI generation log
--
-- Every model call is recorded. Transparency about AI assistance is protective
-- in an audit; the deidentified flag records whether PHI left our infra.
-- ---------------------------------------------------------------------------

create table if not exists ghh.ai_generations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references ghh.organizations(id) on delete cascade,
  note_id uuid null references ghh.notes(id) on delete set null,
  actor_id uuid null references ghh.profiles(id) on delete set null,
  mode ghh.ai_mode not null,
  model text not null,
  deidentified boolean not null,
  prompt_hash text null,
  input_tokens integer null,
  output_tokens integer null,
  cache_read_tokens integer null,
  -- Claims the model produced that were not present in the structured input.
  -- Should always be empty; a non-empty array flags the note for review.
  unsupported_claims jsonb not null default '[]'::jsonb,
  refused boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ai_generations_note_idx on ghh.ai_generations(note_id);

-- ---------------------------------------------------------------------------
-- Audit log — every touch of PHI
-- ---------------------------------------------------------------------------

create table if not exists ghh.audit_log (
  id bigserial primary key,
  org_id uuid null,
  actor_id uuid null,
  action text not null,
  entity text not null,
  entity_id uuid null,
  detail jsonb not null default '{}'::jsonb,
  ip inet null,
  user_agent text null,
  at timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on ghh.audit_log(entity, entity_id, at desc);
create index if not exists audit_log_actor_idx on ghh.audit_log(actor_id, at desc);

-- ---------------------------------------------------------------------------
-- Table privileges for the application role. RLS decides which rows; these
-- decide which verbs are reachable at all.
-- ---------------------------------------------------------------------------

grant select on
  ghh.organizations, ghh.homes, ghh.shifts, ghh.form_templates,
  ghh.profiles, ghh.staff_homes, ghh.residents,
  ghh.ai_generations, ghh.audit_log
  to ghh_app;

grant update on ghh.profiles to ghh_app;
grant insert, update, delete on ghh.residents to ghh_app;
grant select, insert, update, delete on ghh.notes to ghh_app;
grant select, insert on ghh.note_addenda to ghh_app;
grant usage, select on all sequences in schema ghh to ghh_app;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'homes', 'profiles', 'residents',
    'shifts', 'form_templates', 'notes', 'users'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on ghh.%I', t, t);
    execute format(
      'create trigger %I_set_updated_at before update on ghh.%I
         for each row execute function ghh.set_updated_at()',
      t, t
    );
  end loop;
end;
$$;
`
  },
  {
    name: "0002_rls.sql",
    sql: `-- Row Level Security.
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
-- Identity comes from \`app.user_id\`, a transaction-local setting applied by
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
`
  },
  {
    name: "0003_immutability.sql",
    sql: `-- Signed notes are immutable.
--
-- A Daily Progress Note is the billing substantiation for a shift. Once a DSP
-- signs it, it becomes part of the record: it is never edited, only appended to
-- via ghh.note_addenda. This is the property an auditor checks first, and it is
-- enforced here in the database rather than in application code so that no
-- route, script, or console session can bypass it.
--
-- These triggers fire for every role, including the owner. That is deliberate:
-- not even a maintenance script or a direct psql session can rewrite a signed
-- note.

-- ---------------------------------------------------------------------------
-- Block edits to a locked note
-- ---------------------------------------------------------------------------

create or replace function ghh.enforce_note_immutable()
returns trigger
language plpgsql
as $$
begin
  -- OLD.locked is the gate, not NEW.locked: the signing UPDATE itself flips
  -- false -> true and must be allowed exactly once.
  if old.locked then
    raise exception
      'note % is signed and cannot be modified; add an addendum instead', old.id
      using errcode = 'restrict_violation',
            hint = 'insert into ghh.note_addenda (note_id, body, ...)';
  end if;

  -- Signing must carry a full attribution block. The CHECK constraints cover
  -- presence; this covers coherence.
  if new.status = 'signed' and old.status = 'draft' then
    if new.signed_by is null or new.signature_name is null or new.signature_title is null then
      raise exception 'cannot sign note % without signer, name, and title', new.id
        using errcode = 'not_null_violation';
    end if;
    if new.narrative is null or btrim(new.narrative) = '' then
      raise exception 'cannot sign note % with an empty narrative', new.id
        using errcode = 'check_violation';
    end if;
    -- Signing always locks. Callers do not get to opt out.
    new.locked := true;
    new.signed_at := coalesce(new.signed_at, now());
  end if;

  -- A signed note can never be walked back to a draft.
  if old.status = 'signed' and new.status = 'draft' then
    raise exception 'note % cannot be reverted to draft', old.id
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists notes_immutable_when_locked on ghh.notes;
create trigger notes_immutable_when_locked
  before update on ghh.notes
  for each row execute function ghh.enforce_note_immutable();

-- ---------------------------------------------------------------------------
-- Block deletion of a signed note
-- ---------------------------------------------------------------------------

create or replace function ghh.enforce_note_undeletable()
returns trigger
language plpgsql
as $$
begin
  if old.locked or old.status = 'signed' then
    raise exception 'note % is signed and cannot be deleted', old.id
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists notes_no_delete_when_signed on ghh.notes;
create trigger notes_no_delete_when_signed
  before delete on ghh.notes
  for each row execute function ghh.enforce_note_undeletable();

-- ---------------------------------------------------------------------------
-- Addenda are append-only
-- ---------------------------------------------------------------------------

create or replace function ghh.enforce_addendum_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'addenda are append-only and cannot be % ', lower(tg_op)
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists note_addenda_no_update on ghh.note_addenda;
create trigger note_addenda_no_update
  before update on ghh.note_addenda
  for each row execute function ghh.enforce_addendum_append_only();

drop trigger if exists note_addenda_no_delete on ghh.note_addenda;
create trigger note_addenda_no_delete
  before delete on ghh.note_addenda
  for each row execute function ghh.enforce_addendum_append_only();

-- ---------------------------------------------------------------------------
-- The audit log is append-only too
-- ---------------------------------------------------------------------------

create or replace function ghh.enforce_audit_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only' using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists audit_log_no_update on ghh.audit_log;
create trigger audit_log_no_update
  before update on ghh.audit_log
  for each row execute function ghh.enforce_audit_append_only();

drop trigger if exists audit_log_no_delete on ghh.audit_log;
create trigger audit_log_no_delete
  before delete on ghh.audit_log
  for each row execute function ghh.enforce_audit_append_only();
`
  },
  {
    name: "0004_seed_680.sql",
    sql: `-- Seed: Form #680 (Daily Progress Note) + At Home Family Services org data.
--
-- The template \`schema\` is the single definition of the form. The web form,
-- the AI grounding input, and the PDF all read from it, so adding a field
-- means editing this JSON rather than three React files.
--
-- Chip vocabulary is drawn from the exemplar note in EE/detail.jpg so that
-- generated narrative lands in the agency's existing documentation voice.

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
  $json\${
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
  $render\${
    "page": { "size": "LETTER", "margin": 42 },
    "header": {
      "logo": "/brand/AHFS_logo.png",
      "org_line": "At Home Family Service, LLC",
      "title": "Daily Progress Note"
    },
    "footer": {
      "form_line": "Daily Progress Notes Form #680"
    },
    "narrative_min_height": 340
  }$render$::jsonb
)
on conflict (id) do nothing;
`
  },
  {
    name: "0005_audit.sql",
    sql: `-- Audit logging.
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
    ghh.current_user_id(),
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
    new.org_id, ghh.current_user_id(), 'note.addendum', 'note', new.note_id,
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
    ghh.current_user_id(),
    p_action,
    p_entity,
    p_entity_id,
    coalesce(p_detail, '{}'::jsonb),
    nullif(p_ip, '')::inet,
    p_user_agent
  );
end;
$$;

grant execute on function ghh.log_access(text, text, uuid, jsonb, text, text) to ghh_app;

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

grant execute on function ghh.roster_for_date(uuid, date) to ghh_app;
`
  }
];
