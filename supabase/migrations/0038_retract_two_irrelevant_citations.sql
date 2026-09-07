-- Retract the Alabama and Connecticut citations. They were real and they were
-- not about progress notes.
--
-- 0037 promoted twenty-seven states to a cited footer on the strength of
-- scripts/verify-citations.py, which refetches the state's own site and
-- confirms the rule number and a quotation from the rule are both there. Both
-- of these passed that, correctly: the rules exist, the URLs resolve, the
-- quotations are genuine.
--
-- The check proves a citation EXISTS. It does not prove the citation is ABOUT
-- anything, and these two are about something else:
--
--   US-AL  Ala. Admin. Code r. 580-5-30-.04 is a record-management rule that
--          delegates note content entirely to "ADMH Standards", which are not
--          published in the Administrative Code. It enumerates nothing a
--          progress note must contain. The researcher who found it wrote, in
--          as many words: "DO NOT print an Alabama note-content rule number on
--          a filed record; there isn't one in the Administrative Code."
--
--   US-CT  Conn. Agencies Regs. § 17a-227-16 lists what an individual's file
--          holds -- demographics, health, incidents, restraints. Its own
--          researcher flagged it: Connecticut "does NOT mandate a
--          per-resident, per-shift progress note, and it does not enumerate
--          note fields."
--
-- So each printed "Layout built to satisfy <rule>" at the foot of a document
-- whose layout that rule has nothing to do with. To an auditor -- the one
-- reader whose opinion decides whether a claim gets paid -- that is a false
-- statement on a Medicaid record, and it is worse than the blank footer it
-- replaced, because it looks like diligence.
--
-- Both v2 rows are deleted rather than deactivated. They were live for a few
-- minutes, carry no notes at all (checked before writing this: US-AL v2 and
-- US-CT v2 each had zero), and leaving a retired row that never should have
-- existed only invites someone to wonder later whether it was ever used. The
-- v1 rows they displaced go back to being the active template for those
-- states, which is exactly what they were this morning: a complete, defensible
-- note that claims nothing about state regulation.
--
-- US-AL v1 holds 378 signed notes. Those notes were signed on v1, print on v1,
-- and are untouched by all of this -- which is the reason promotion adds a
-- version instead of editing a row, and the reason this retraction is cheap
-- rather than a records incident.
--
-- verify-citations.py now refuses both states before they can be promoted
-- again: a citation may only be printed when the researcher recorded
-- note-content requirements from that rule and did not flag that the rule
-- fails to govern note content. That gate is a backstop for the case where
-- somebody noticed and said so. It is not a substitute for reading the rule
-- before selling into a state.

delete from ghh.form_templates
 where org_id is null
   and jurisdiction in ('US-AL', 'US-CT')
   and version = 2
   and not exists (
     select 1 from ghh.notes n where n.template_id = ghh.form_templates.id
   );

update ghh.form_templates
   set active = true, updated_at = now()
 where org_id is null
   and jurisdiction in ('US-AL', 'US-CT')
   and version = 1;
