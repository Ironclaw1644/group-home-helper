-- Give a template a human name for its jurisdiction.
--
-- Sign-up has to ask an agency which state it files under, and Settings has to
-- let them correct it. Both need to show "Ohio", not "US-OH".
--
-- The obvious shortcut is a lookup table of the fifty state names in
-- TypeScript. That would quietly break the rule this whole branch exists to
-- establish: adding a state would then be an INSERT *and* a code change *and* a
-- deploy. So the template row declares its own label, alongside its own code,
-- its own layout and its own vocabulary. Authoring a jurisdiction stays one
-- INSERT.
--
-- Nullable, and the UI falls back to the code, so a template authored without
-- one still works — it just reads worse.

alter table ghh.form_templates
  add column if not exists jurisdiction_name text null;

comment on column ghh.form_templates.jurisdiction_name is
  'How this jurisdiction is shown to a human ("Ohio"). Lives here rather than '
  'in a code-side lookup so that adding a state stays a content change.';

update ghh.form_templates set jurisdiction_name = 'Virginia'
 where jurisdiction = 'US-VA' and jurisdiction_name is null;

update ghh.form_templates set jurisdiction_name = 'Ohio'
 where jurisdiction = 'US-OH' and jurisdiction_name is null;

-- Named for what it is, not for a place. An agency picking this is choosing a
-- general-purpose note, and the wording should leave them in no doubt.
update ghh.form_templates
   set jurisdiction_name = 'Another state — general-purpose note'
 where jurisdiction = 'GENERIC' and jurisdiction_name is null;

-- ---------------------------------------------------------------------------
-- What an agency may be offered at sign-up
--
-- Every jurisdiction that has an active, global template. Org-private
-- templates are excluded: those belong to one agency and are nobody else's
-- business, least of all a stranger's on the sign-up page.
--
-- It also returns the form's own title and footer line, so the preview beside
-- the picker shows the document the chosen state will actually print. Without
-- them the preview had Virginia's form line welded into the markup, which is
-- how an Ohio administrator ends up looking at "Form #680" while signing up.
-- Both are scalars off the row already being read: no extra query, and no
-- second place to edit when a state is added.
--
-- security definer, because this is called before anyone is signed in and the
-- form_templates policy requires an authenticated role. It returns nothing but
-- a code, a label and two printed captions — no schema, no layout, no PHI, and
-- no agency identity, which a shared template row is forbidden to carry in the
-- first place (verify:branding fails the build if one ever does). It takes no
-- arguments, so there is nothing to inject.
-- ---------------------------------------------------------------------------

create or replace function ghh.available_jurisdictions()
returns table (
  code text,
  name text,
  form_title text,
  form_line text,
  identity_labels text[]
)
language sql
stable
security definer
set search_path = ghh, public
as $$
  select distinct on (t.jurisdiction)
         t.jurisdiction,
         coalesce(t.jurisdiction_name, t.jurisdiction),
         coalesce(t.render_config -> 'header' ->> 'title', t.name),
         -- Mirrors the renderer's own fallback (lib/forms/layout-defaults.ts),
         -- so the preview cannot promise a caption the PDF will not print.
         coalesce(
           t.render_config -> 'footer' ->> 'form_line',
           case
             when t.form_number is null then t.name
             else 'Daily Progress Notes Form #' || t.form_number
           end
         ),
         -- The labels on the first row of identity blanks — 'Name of
         -- Individual' in Ohio, "Individual's Name" in Virginia. Null when the
         -- template declares no identity rows, which means it prints Form
         -- #680's; the caller falls back to the same constants the renderer
         -- does rather than this function repeating them in SQL.
         (
           select array_agg(field.value ->> 'label' order by field.ord)
             from jsonb_array_elements(
                    t.render_config -> 'identity_rows' -> 0 -> 'fields'
                  ) with ordinality as field(value, ord)
         )
    from ghh.form_templates t
   where t.active and t.org_id is null
   order by t.jurisdiction, t.version desc;
$$;

comment on function ghh.available_jurisdictions() is
  'Codes, labels and printed captions an agency may choose at sign-up. Global '
  'templates only.';

grant execute on function ghh.available_jurisdictions() to anon, authenticated, service_role;
