-- Per-organization branding, so one deployment can serve several agencies
-- each looking like their own product.
--
-- Colors live in the database rather than in Tailwind config because the theme
-- has to change per organization at request time. The app emits them as CSS
-- custom properties and Tailwind's brand.* utilities read those variables, so
-- every existing class keeps working — nothing in the UI needs rewriting to
-- support a new agency.
--
-- `brand_source_url` records where the palette was scanned from, and
-- `brand_scanned_at` when, so a supervisor can tell an auto-extracted theme
-- from a hand-tuned one and re-scan after a rebrand.
--
-- RECONSTRUCTED. This file was missing from the repository; the statements
-- below are the ones actually applied to production on 2026-07-29 as
-- `ghh_0007_org_branding`, recovered verbatim from the applied migration
-- history. Nothing here has been rewritten, including the AHFS backfill, which
-- only ever matches the organization seeded by 0004.

alter table ghh.organizations
  add column if not exists branding jsonb not null default '{}'::jsonb,
  add column if not exists brand_source_url text null,
  add column if not exists brand_scanned_at timestamptz null;

comment on column ghh.organizations.branding is
  'Theme tokens: {navy, teal, aqua, sand, slate, logo_url, font_family}. Missing keys fall back to the AHFS defaults in lib/branding/theme.ts.';

-- Backfill the existing organization with the AHFS palette so nothing renders
-- unstyled between this migration and the first save.
update ghh.organizations
   set branding = jsonb_build_object(
         'navy',  '#0f2d45',
         'teal',  '#0c9ea6',
         'aqua',  '#6fe2df',
         'sand',  '#f5f1ea',
         'slate', '#536779',
         'logo_url', '/brand/AHFS_logo.png'
       )
 where branding = '{}'::jsonb;

-- Supervisors and admins may retheme their own organization. The existing
-- org_read policy already scopes reads; this adds the write side, which did
-- not exist before because nothing was editable on this table.
drop policy if exists org_update_branding on ghh.organizations;
create policy org_update_branding on ghh.organizations
  for update to authenticated
  using (id = ghh.auth_org() and ghh.is_supervisor())
  with check (id = ghh.auth_org() and ghh.is_supervisor());

grant update (branding, brand_source_url, brand_scanned_at, logo_url, name, legal_name, timezone)
  on ghh.organizations to authenticated;
