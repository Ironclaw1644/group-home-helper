-- Jurisdictions: make the form a row a state is added as, not code to edit.
--
-- Until now `lib/notes/repo.ts` resolved one hardcoded template key
-- ('daily_progress_note_680') for every organization on the install, so a
-- customer outside Virginia printed Virginia's DBHDS Form #680. This migration
-- adds the axis that was missing: an organization is in a jurisdiction, a
-- template belongs to a jurisdiction, and the two are matched.
--
-- ADDITIVE ONLY. Nothing here rewrites history, drops a column, or relaxes a
-- policy. Every existing row is backfilled to 'US-VA', which is what every
-- existing row already was in practice — At Home Family Services is a
-- DBHDS-licensed Virginia provider and the only template installed is #680.
-- That backfill is the regression bar: after this migration every existing
-- organization still resolves the same Form #680 row it resolved before.

-- ---------------------------------------------------------------------------
-- Jurisdiction code format
--
-- ISO-3166-2-shaped ('US-VA', 'US-OH') plus the reserved literal 'GENERIC'.
--
-- 'GENERIC' is not a place. It is the template used by an agency whose state
-- nobody has authored a form for yet: a defensible progress note that claims
-- no regulatory pedigree. It exists so that "we have not built your state yet"
-- degrades into a plain document rather than into another state's official
-- form, which would be filed with Medicaid looking authoritative and be wrong.
-- ---------------------------------------------------------------------------

alter table ghh.organizations
  add column if not exists jurisdiction text not null default 'US-VA';

alter table ghh.form_templates
  add column if not exists jurisdiction text not null default 'US-VA';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_jurisdiction_format'
  ) then
    alter table ghh.organizations
      add constraint organizations_jurisdiction_format
      check (jurisdiction ~ '^([A-Z]{2}-[A-Z]{2}|GENERIC)$');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'form_templates_jurisdiction_format'
  ) then
    alter table ghh.form_templates
      add constraint form_templates_jurisdiction_format
      check (jurisdiction ~ '^([A-Z]{2}-[A-Z]{2}|GENERIC)$');
  end if;
end
$$;

comment on column ghh.organizations.jurisdiction is
  'Which state''s documentation rules this agency files under. Matched against '
  'ghh.form_templates.jurisdiction. Never falls back to another state.';

comment on column ghh.form_templates.jurisdiction is
  'The jurisdiction whose requirements this template satisfies, or GENERIC for '
  'the no-state-claimed fallback.';

-- The shipped Form #680 row is Virginia's. Named explicitly rather than left to
-- the column default, so this is true even if the default is ever changed.
update ghh.form_templates
   set jurisdiction = 'US-VA'
 where key = 'daily_progress_note_680';

-- Template lookup is (jurisdiction, active, version desc) on every note render,
-- every draft and every export, so it is worth an index.
create index if not exists form_templates_jurisdiction_idx
  on ghh.form_templates (jurisdiction, active, version desc);

create index if not exists organizations_jurisdiction_idx
  on ghh.organizations (jurisdiction);

-- ---------------------------------------------------------------------------
-- RLS
--
-- The existing form_templates_read policy already scopes to
-- `active and (org_id is null or org_id = ghh.auth_org())`. Jurisdiction is
-- NOT added to it, deliberately:
--
--   * Template rows carry no PHI and no customer identity — 0004's own header
--     says so, and verify:branding fails the build if an agency name ever
--     reaches one. There is nothing here to leak.
--   * Matching happens in ghh.template_for_org() below and in
--     lib/notes/repo.ts, where a mismatch is an error rather than an empty
--     result. A policy that silently filtered the row away would turn "this
--     org is in a state we have no form for" into "the form template is not
--     installed", which is the same message as a broken install.
--
-- No policy is weakened here. No policy is changed here at all.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Resolution, in the database, so SQL callers and scripts agree with the app
--
-- Precedence, highest first:
--   1. a template owned by this org, in this org's jurisdiction
--   2. a global template in this org's jurisdiction
--   3. a global GENERIC template
--
-- There is no rule 4. An org is never given another state's form.
-- ---------------------------------------------------------------------------

create or replace function ghh.template_for_org(p_org_id uuid)
returns ghh.form_templates
language sql
stable
security invoker
set search_path = ghh, public
as $$
  select t.*
    from ghh.form_templates t
    join ghh.organizations o on o.id = p_org_id
   where t.active
     and (t.org_id = o.id or t.org_id is null)
     and (t.jurisdiction = o.jurisdiction or t.jurisdiction = 'GENERIC')
   order by
     -- an org's own template beats the shared one
     (t.org_id is not null) desc,
     -- the org's actual jurisdiction beats the GENERIC fallback
     (t.jurisdiction = o.jurisdiction) desc,
     t.version desc
   limit 1;
$$;

comment on function ghh.template_for_org(uuid) is
  'The form template an organization files under. Own > jurisdiction > GENERIC. '
  'Never returns another jurisdiction''s template.';

grant execute on function ghh.template_for_org(uuid) to authenticated, service_role;
