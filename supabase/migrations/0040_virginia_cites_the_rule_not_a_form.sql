-- Virginia does not publish a Form #680. Nobody does. Stop printing one.
--
-- ===========================================================================
-- WHAT WAS WRONG
-- ===========================================================================
--
-- Every Virginia note has printed "Daily Progress Notes Form #680" at the foot
-- of the page since 0004, the first seed migration, and the template carried
-- form_number = '680'.
--
-- There is no such form. 680 is a SECTION of a regulation:
--
--   12VAC35-105-680. Progress notes or other documentation.
--   "The provider shall use signed and dated progress notes or other
--    documentation to document the services provided and the implementation of
--    the goals and objectives contained in the ISP."
--   https://law.lis.virginia.gov/admincode/title12/agency35/chapter105/section680/
--
-- Somebody read a citation and turned it into a form number. DBHDS publishes
-- fillable forms under other names entirely and none of them is "680"; the
-- number only ever meant "the paragraph of 12VAC35-105 that requires progress
-- notes".
--
-- docs/adding-a-state.md states the rule this broke, and states it about this
-- exact field: "A form number is a claim that a numbered state document exists
-- and that this is it... An invented one on a Medicaid record is worse than a
-- blank page, because a blank page does not get filed."
--
-- The irony is worth writing down. Forty-nine states were put through a
-- citation verifier that refetches the state's own site and demands the rule
-- number and a verbatim quotation both appear there. Virginia was never put
-- through it, because Virginia was the premise the verifier was built to
-- protect. The founding claim was the only unchecked one.
--
-- ===========================================================================
-- WHAT THIS DOES
-- ===========================================================================
--
-- Virginia becomes what it always actually was: a state that publishes a rule,
-- like the twenty-two others that cite one. form_number goes to null and the
-- footer cites 12VAC35-105-680 and says plainly that it is not a state-issued
-- form. The layout does not change — it was a good layout before it had a
-- false number on it, and it is the same document without one.
--
-- The dead header keys go too. The row is global (org_id null) and carried
-- `logo: /brand/AHFS_logo.png` and `org_line: At Home Family Service, LLC` —
-- one agency's letterhead on a template shared by every agency in the state.
-- TemplatePdf already refuses to read either, deliberately and with a comment
-- saying why, so nothing printed wrongly. Removing them takes away a landmine
-- rather than fixing a live leak.
--
-- ===========================================================================
-- WHAT THIS DOES NOT DO
-- ===========================================================================
--
-- It does not touch a signed note. Promotion adds a version; v1 is retired and
-- keeps every note already signed under it, which still print "Form #680"
-- exactly as they did on the day they were signed. That is not an oversight —
-- the database physically refuses to repoint a signed note, and a record that
-- changes after signature is worth less than one with a wrong caption.
--
-- Six of those are real: At Home Family Services. The rest are demo sandboxes
-- and fictional. Whoever talks to that agency should tell them the footer on
-- those six cites a form number that does not exist, and that every note they
-- sign from today cites the regulation instead. It is a caption on a document
-- whose content was always correct, but they should hear it from us.

update ghh.form_templates
   set active = false, updated_at = now()
 where org_id is null and jurisdiction = 'US-VA' and active;

insert into ghh.form_templates (
  id, org_id, key, version, name, form_number, jurisdiction,
  jurisdiction_name, schema, render_config
)
select
  '00000000-0000-0000-0000-000000000399'::uuid,
  null,
  'daily_progress_note_va_v2',
  2,
  'Daily Progress Note',
  null,
  'US-VA',
  'Virginia',
  v.schema,
  jsonb_build_object(
    'page', jsonb_build_object('size', 'LETTER', 'margin', 42, 'padding_bottom', 100),
    'header', jsonb_build_object('title', 'Daily Progress Note'),
    'footer', jsonb_build_object(
      'form_line', 'Daily Progress Note',
      'legal_citation',
      'Layout built to satisfy 12VAC35-105-680. Not a state-issued form.'
    ),
    'narrative_min_height', 340
  )
from ghh.form_templates v
where v.id = '00000000-0000-0000-0000-000000000100'
on conflict (id) do nothing;

-- Converge on re-run: exactly the v2 row is the active one for Virginia.
update ghh.form_templates
   set active = (id = '00000000-0000-0000-0000-000000000399'::uuid), updated_at = now()
 where org_id is null and jurisdiction = 'US-VA';
