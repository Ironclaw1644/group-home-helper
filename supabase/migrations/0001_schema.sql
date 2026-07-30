-- Group Home Helper — core schema.
--
-- Everything lives in the `ghh` schema and carries `org_id`. There is one
-- organization today (At Home Family Services); the column exists from day one
-- so onboarding a second agency is an INSERT, not a migration.
--
-- This schema holds PHI and shares a project with other applications, so the
-- isolation has to come from the schema boundary and from RLS rather than from
-- the project. RLS is enabled in 0002; nothing in this file grants blanket
-- access, and every table is scoped by org_id.

create extension if not exists "pgcrypto";

create schema if not exists ghh;

grant usage on schema ghh to authenticated, service_role;

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
  id uuid primary key references auth.users(id) on delete cascade,
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
-- Both RPCs are revoked from `authenticated` below: only service_role may call
-- them, and only after server code has confirmed the caller may see the
-- resident. RLS alone would not be enough here, because these are the one path
-- that turns ciphertext back into PHI.
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

-- Server-side only. The browser must never be able to reach these.
revoke all on function ghh.read_medicaid_id(uuid, text) from public, authenticated, anon;
revoke all on function ghh.write_medicaid_id(uuid, text, text) from public, authenticated, anon;
grant execute on function ghh.read_medicaid_id(uuid, text) to service_role;
grant execute on function ghh.write_medicaid_id(uuid, text, text) to service_role;

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
-- Form #680 is the first template. `schema` describes sections and fields;
-- `render_config` describes the PDF layout. Adding a second form (MAR,
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
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'homes', 'profiles', 'residents',
    'shifts', 'form_templates', 'notes'
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
