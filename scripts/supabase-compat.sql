-- The parts of a Supabase project that exist before any of our migrations run.
--
-- Used only by `npm run verify:schema`, which applies supabase/migrations/ to a
-- throwaway embedded Postgres to prove the repository can rebuild the database.
-- Supabase provides these roles, schemas and tables itself, so no migration in
-- this repo creates them — which means a bare Postgres cannot run the migration
-- set at all without them, and the rebuild could never be tested.
--
-- This file is a test fixture, not a migration. It is deliberately the minimum
-- the migrations touch: enough for `to authenticated` grants, `auth.uid()`,
-- storage buckets and the PostgREST schema setting to resolve. It is never
-- applied to any real database.

create extension if not exists pgcrypto;

-- Supabase's four standard roles.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password 'compat-fixture-only';
  end if;
end
$$;

-- GoTrue's user table. 0001 references it for the profiles foreign key.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- The two claim helpers RLS is written against. The real implementations read
-- the verified JWT; these read the same request-local settings, so a policy
-- that calls them behaves identically under `set local`.
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;

-- Supabase Storage. Only the columns our migrations write.
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz not null default now()
);

-- RLS on with no policy is how both buckets stay private; 0006 and 0016 rely
-- on that being the starting state rather than setting it themselves.
alter table storage.objects enable row level security;
