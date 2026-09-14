-- ===========================================================================
-- NOT APPLIED. DRAFT FROM spike/form-importer (2026-09-14).
-- ===========================================================================
--
-- This file has not been run against any database, local or hosted, and it
-- lives outside supabase/migrations on purpose so db:bundle and db:apply cannot
-- pick it up. Review it, number it, and move it only when the importer is
-- being built for real.
--
-- What it would hold: the in-app e-signature of a client's Business Associate
-- Agreement, which is one of the two conditions for Path 3 (photos of written
-- notes). The other condition, FlipBrief's own BAA with the AI provider, is
-- server config and deliberately has no table a client could write to.

create table if not exists ghh.baa_acceptances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references ghh.organizations(id) on delete cascade,
  signer_user_id uuid null,
  signer_name text not null check (length(btrim(signer_name)) >= 2),
  signer_role text not null check (length(btrim(signer_role)) >= 2),
  -- The exact version of the BAA text shown. A new version needs a new signature.
  baa_version text not null,
  -- sha256 of the text shown, so "which words did they sign" is answerable later.
  baa_text_sha256 text not null,
  accepted_at timestamptz not null default now(),
  ip_address inet null,
  user_agent text null,
  revoked_at timestamptz null
);

create index if not exists baa_acceptances_org_idx on ghh.baa_acceptances (org_id, baa_version) where revoked_at is null;

-- Append-only: a signature is never edited, only revoked by a later row update
-- of revoked_at by an admin path. RLS policies still to be written.
alter table ghh.baa_acceptances enable row level security;
