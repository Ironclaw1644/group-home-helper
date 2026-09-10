-- Let the state picker show the thing the state picker changes.
--
-- Settings has a "State you file under" dropdown with a live preview of the
-- printed form beside it, and the preview renders two captions: the heading and
-- the footer form line. For fifty-one of the fifty-two options those two values
-- are identical -- "Daily Progress Note" and "Daily Progress Note". Only West
-- Virginia looks different, because only West Virginia has its own form title.
--
-- So an owner in Texas picks Texas, an owner in Colorado picks Colorado, and
-- both watch a preview that does not move. The screen reads as though the
-- choice does nothing.
--
-- The choice does plenty. What differs between those states is the legal
-- citation printed at the foot of the page: Texas gets its HHSC billing
-- requirements, Colorado gets nothing because Colorado publishes no rule about
-- note content. That is the entire value of the setting, and it was the one
-- field the preview did not have.
--
-- This was found while trying to film the picker. The film would have shown the
-- same form fifty-one times, which is a fair description of what the screen
-- currently does and a poor advertisement for it.
--
-- `legal_citation` is added as a nullable column rather than folded into
-- form_line, because they are different claims. form_line names the document.
-- legal_citation asserts which rule the layout was built to satisfy, and it is
-- null for the twenty-four states where we have read no rule -- which is
-- exactly the signal a buyer in one of those states needs to see before they
-- commit, rather than after.
--
-- No fallback. Unlike form_line, an absent citation must render as absent:
-- inventing one is the failure this whole line of work exists to prevent.

-- Dropped first, not replaced. Postgres refuses to change the return type of
-- an existing function ("cannot change return type of existing function"), and
-- adding a column to a RETURNS TABLE is exactly that. The grant at the foot of
-- this file is not optional housekeeping: dropping the function takes its
-- grants with it, and without the re-grant the sign-up picker would come back
-- empty for anonymous visitors -- the same failure the comment inside
-- listJurisdictions describes.
drop function if exists ghh.available_jurisdictions();

create function ghh.available_jurisdictions()
returns table (
  code text,
  name text,
  form_title text,
  form_line text,
  identity_labels text[],
  legal_citation text
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
         ),
         -- Exactly what the PDF prints at the foot, or null. Never a fallback.
         t.render_config -> 'footer' ->> 'legal_citation'
    from ghh.form_templates t
   where t.active and t.org_id is null
   order by t.jurisdiction, t.version desc;
$$;

comment on function ghh.available_jurisdictions() is
  'Codes, labels and printed captions an agency may choose at sign-up, plus the '
  'legal citation the chosen state prints at the foot of the page (null where '
  'the state publishes no rule about note content). Global templates only.';

grant execute on function ghh.available_jurisdictions() to anon, authenticated, service_role;
