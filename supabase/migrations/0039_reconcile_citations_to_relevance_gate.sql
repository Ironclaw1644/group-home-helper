-- Bring the live citations back in line with what the relevance gate allows.
--
-- 0038 retracted Alabama and Connecticut: real rules, correctly quoted, that
-- said nothing about what a progress note contains. The gate written alongside
-- it matched a handful of exact phrases lifted from those two states, which
-- worked precisely as well as that sounds. South Dakota's researcher wrote the
-- same warning in different words -- "describes the contents of the
-- participant's record, not the contents of a per-shift progress note" -- and
-- went straight through it.
--
-- So the gate now matches the shape of the claim rather than its wording: a
-- negated content verb near "note". Running that over all forty-five
-- researched states says the problem was never two states. It is seventeen.
--
-- Most states do not enumerate what a shift note must contain. Ohio's
-- twelve-element list is unusual, which is exactly why Ohio was chosen as the
-- second template in the first place. Rules that require documentation be kept
-- while leaving its contents to the provider are the norm, and a footer
-- claiming a layout was "built to satisfy" such a rule is asserting something
-- the rule does not say.
--
-- Retracted here, all currently live with a cited footer:
--
--   US-AZ  US-CO  US-IL  US-MN  US-ND  US-NM  US-OK  US-OR
--
-- Colorado is the one worth dwelling on. When 0038 was written it was checked
-- by hand, judged a false positive, and deliberately kept. That judgement was
-- wrong: its own research notes say the rule does "not enumerate a per-shift
-- progress note", in a part of the note that a truncated read did not reach.
-- The pattern found in a second what a manual skim had got backwards, which is
-- the argument for the gate over the eyeball.
--
-- Three others matched the pattern and are kept, because the negation is about
-- something else entirely and the footer's claim survives it:
--
--   US-NC  "a daily note is not required" -- frequency by funding stream. NC
--          Innovations needs a daily grid, state-funded needs monthly. The
--          rule still enumerates twelve content elements.
--   US-GA, US-IN  "No credential is specified for the signer" -- who signs,
--          not what the note holds. A rule can enumerate a note exactly and
--          demand nobody sign it.
--   US-HI, US-NY  "no specific form is mandated - only required content" and
--          "No numbered form - the ADM prescribes format and content". Both
--          say outright that the content requirement exists.
--
-- Net: twenty-five cited states become twenty-one. Four arrive from the last
-- research batch (US-GA, US-MA, US-TX, US-WV) and are created by 0037.
--
-- West Virginia is worth a note for whoever reads this next. It publishes
-- WV-BMS-IDD-07, a mandatory Direct-Support Service Log -- the only state
-- besides Virginia found to issue an actual numbered form across all fifty. It
-- is cited here as a rule, and form_number stays null, because this layout is
-- not that document. Building it properly is the same job Ohio got.
--
-- v2 rows are deleted rather than retired, and only when no note points at
-- them. A row that should never have existed is not history worth keeping, and
-- the guard means a state that has been used in earnest fails loudly here
-- instead of quietly losing its citation.

-- Named as the eight jurisdictions this retracts, rather than as everything
-- absent from a list of the survivors.
--
-- It was written the other way round -- "not in (the twenty-one that keep a
-- citation)" -- which reads like the same statement and is not. 0037 is a
-- GENERATED file, and the set of states holding a v2 row grows every time
-- somebody reads a rule and re-runs the generator. A survivor list frozen here
-- therefore quietly means "and delete any state promoted after today", which is
-- what it did: Florida, Louisiana, Maine and Wyoming were promoted, a v2 row is
-- the only row the generator writes for a cited state, and replaying the
-- migrations deleted all four outright. The live database did not show it,
-- because this file had already run there before those states were promoted. A
-- fresh one -- staging, a restore, anybody's first checkout -- came up four
-- states short with every check green.
--
-- A retraction should name what it retracts. Then it stays true however far
-- 0037 moves on.
delete from ghh.form_templates t
 where t.org_id is null
   and t.version = 2
   and t.jurisdiction in (
     'US-AZ','US-CO','US-IL','US-MN','US-ND','US-NM','US-OK','US-OR'
   )
   and not exists (select 1 from ghh.notes n where n.template_id = t.id);

-- Whatever lost its v2 above goes back to the uncited v1 it displaced. Scoped
-- to jurisdictions with no active row so it cannot disturb a state that is
-- legitimately running on v2.
update ghh.form_templates t
   set active = true, updated_at = now()
 where t.org_id is null
   and t.version = 1
   and not exists (
     select 1 from ghh.form_templates a
      where a.org_id is null and a.jurisdiction = t.jurisdiction and a.active
   );
