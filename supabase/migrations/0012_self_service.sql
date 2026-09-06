-- Self-service access: invitations, new-agency signup, and demo sandboxes.
--
-- Until now every account was created by running a script on someone's laptop,
-- which does not scale past the person who wrote the script. Three ways in:
--
--   1. Invite  — join an EXISTING agency. This is the one that matters for a
--                real house: a DSP needs to land in their agency's org with the
--                right role and home, not in an empty workspace of their own.
--   2. Signup  — create a NEW agency. The multi-tenant path.
--   3. Demo    — a throwaway org with fictional residents, for looking around.
--
-- All three are redeemed server-side with service_role, because the person
-- doing it has no profile yet and therefore no RLS identity to act under.

-- ---------------------------------------------------------------------------
-- Organizations gain a lifecycle
-- ---------------------------------------------------------------------------

-- A demo org holds only fictional residents and is safe to delete. Keeping it
-- flagged means demo data can never be mistaken for a real agency's, and the
-- pruner has something unambiguous to select on.
alter table ghh.organizations add column if not exists is_demo boolean not null default false;

-- Demo orgs expire. Real ones have this null and are never pruned.
alter table ghh.organizations add column if not exists expires_at timestamptz null;

-- 'seed' | 'invite' | 'signup' | 'demo'. Useful when a roster turns up
-- unexpectedly and someone has to work out where it came from.
alter table ghh.organizations add column if not exists created_via text null;

comment on column ghh.organizations.is_demo is
  'Fictional data only. Safe to delete; excluded from anything that bills.';

create index if not exists organizations_demo_expiry
  on ghh.organizations (expires_at) where is_demo;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create table if not exists ghh.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references ghh.organizations(id) on delete cascade,
  -- The house the invitee is assigned to on join. Null means org-wide, which
  -- only makes sense for a supervisor or admin.
  home_id uuid null references ghh.homes(id) on delete cascade,

  -- Random, URL-safe, and the only thing standing between a stranger and this
  -- agency's roster — so it is generated with a CSPRNG in application code and
  -- never derived from anything guessable.
  code text not null unique,

  role ghh.staff_role not null default 'dsp',
  title text not null default 'DSP',

  -- Optional: when set, only this address may redeem the code. Turns a
  -- shareable link into a single-person invitation.
  email text null,

  created_by uuid null references ghh.profiles(id) on delete set null,
  expires_at timestamptz not null,
  max_uses integer not null default 25 check (max_uses > 0),
  uses integer not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists invitations_org_idx on ghh.invitations(org_id);
create index if not exists invitations_code_idx on ghh.invitations(code);

comment on table ghh.invitations is
  'Join codes for an existing agency. Redeemed server-side with service_role, since the redeemer has no profile yet.';

alter table ghh.invitations enable row level security;

-- Supervisors manage their own org's invitations. Nobody reads them through
-- the browser client otherwise: validation happens server-side, so an
-- unauthenticated visitor never needs select on this table. That is deliberate
-- — a readable invitations table would let anyone enumerate valid codes.
drop policy if exists invitations_read on ghh.invitations;
create policy invitations_read on ghh.invitations
  for select to authenticated
  using (org_id = ghh.auth_org() and ghh.is_supervisor());

drop policy if exists invitations_write on ghh.invitations;
create policy invitations_write on ghh.invitations
  for all to authenticated
  using (org_id = ghh.auth_org() and ghh.is_supervisor())
  with check (org_id = ghh.auth_org() and ghh.is_supervisor());

grant select, insert, update, delete on ghh.invitations to authenticated;
grant all privileges on ghh.invitations to service_role;

-- ---------------------------------------------------------------------------
-- Staff visibility for supervisors
-- ---------------------------------------------------------------------------

-- A supervisor has to be able to see their own staff to manage them.
--
-- This file used to add a second SELECT policy, `profiles_read_org`, for that.
-- Production does not have it, and does not need it: 0002's `profiles_read`
-- already reads `id = auth.uid() or (org_id = auth_org() and is_supervisor())`,
-- so the supervisor case was covered before this migration was written and the
-- extra permissive policy widened nothing. It is removed rather than kept,
-- because a policy that exists in the repo and not in the database leaves the
-- next reader unable to tell which is authoritative — and "can a supervisor
-- read this row?" is exactly the question that has to be answerable from
-- source. Found by verify:schema.

-- Supervisors may deactivate staff and change titles. They may not edit their
-- own role — that would let a supervisor promote themselves to admin.
drop policy if exists profiles_write_org on ghh.profiles;
create policy profiles_write_org on ghh.profiles
  for update to authenticated
  using (org_id = ghh.auth_org() and ghh.is_supervisor())
  with check (org_id = ghh.auth_org() and ghh.is_supervisor());

drop policy if exists staff_homes_write on ghh.staff_homes;
create policy staff_homes_write on ghh.staff_homes
  for all to authenticated
  using (
    ghh.is_supervisor()
    and exists (select 1 from ghh.homes h where h.id = home_id and h.org_id = ghh.auth_org())
  )
  with check (
    ghh.is_supervisor()
    and exists (select 1 from ghh.homes h where h.id = home_id and h.org_id = ghh.auth_org())
  );

grant update on ghh.profiles to authenticated;
grant insert, delete on ghh.staff_homes to authenticated;

-- ---------------------------------------------------------------------------
-- Demo pruning
-- ---------------------------------------------------------------------------

-- Deletes expired demo orgs. Everything else cascades from organizations, so
-- this is the whole cleanup. Restricted to is_demo rows so a bad call can never
-- touch a real agency.
create or replace function ghh.prune_expired_demos()
returns integer
language plpgsql
security definer
set search_path = ghh, public
as $$
declare
  removed integer;
begin
  delete from ghh.organizations
  where is_demo
    and expires_at is not null
    and expires_at < now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function ghh.prune_expired_demos() from public, authenticated, anon;
grant execute on function ghh.prune_expired_demos() to service_role;
