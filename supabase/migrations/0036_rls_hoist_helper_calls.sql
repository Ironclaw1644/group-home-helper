-- 0036_rls_hoist_helper_calls.sql
--
-- Every policy in this schema called ghh.auth_org() / ghh.is_supervisor() /
-- auth.uid() bare in its predicate. Those functions are STABLE, but a STABLE
-- function in a row filter is still evaluated once per row -- and each of these
-- runs its own SELECT against ghh.profiles. Reading 8,145 audit rows therefore
-- issued ~16,000 profile lookups and took 1.34s:
--
--   Seq Scan on audit_log
--     Filter: (ghh.is_supervisor() AND (org_id = ghh.auth_org()))
--     Rows Removed by Filter: 8036
--     Buffers: shared hit=16848
--   Execution Time: 1343.317 ms
--
-- Wrapping each call in a scalar subquery -- (select ghh.auth_org()) -- makes
-- the planner evaluate it once as an InitPlan instead of per row. The predicate
-- is otherwise byte-identical: same functions, same operators, same order. Only
-- zero-argument helpers are wrapped; can_access_home(home_id) and
-- home_in_my_org(home_id) take a column from the row under test and genuinely
-- have to run per row.
--
-- This is a performance change with no intended change in who can read what.
-- scripts/verify-rls-visibility.py counts the rows visible to one admin, one
-- DSP and an admin of a second org, table by table, before and after; the
-- counts must match exactly.

drop policy if exists ai_generations_read on ghh.ai_generations;
create policy ai_generations_read on ghh.ai_generations
  as permissive for select to authenticated
  using (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
;

drop policy if exists audit_log_read on ghh.audit_log;
create policy audit_log_read on ghh.audit_log
  as permissive for select to authenticated
  using (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
;

drop policy if exists documents_read on ghh.documents;
create policy documents_read on ghh.documents
  as permissive for select to authenticated
  using (((org_id = (select ghh.auth_org())) AND ((resident_id IS NULL) OR (EXISTS ( SELECT 1
   FROM ghh.residents r
  WHERE ((r.id = documents.resident_id) AND ghh.can_access_home(r.home_id)))))))
;

drop policy if exists documents_write on ghh.documents;
create policy documents_write on ghh.documents
  as permissive for all to authenticated
  using (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
  with check (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
;

drop policy if exists form_templates_read on ghh.form_templates;
create policy form_templates_read on ghh.form_templates
  as permissive for select to authenticated
  using ((active AND ((org_id IS NULL) OR (org_id = (select ghh.auth_org())))))
;

drop policy if exists homes_read on ghh.homes;
create policy homes_read on ghh.homes
  as permissive for select to authenticated
  using (((org_id = (select ghh.auth_org())) AND ghh.can_access_home(id)))
;

drop policy if exists invitations_read on ghh.invitations;
create policy invitations_read on ghh.invitations
  as permissive for select to authenticated
  using (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
;

drop policy if exists invitations_write on ghh.invitations;
create policy invitations_write on ghh.invitations
  as permissive for all to authenticated
  using (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
  with check (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
;

drop policy if exists note_activities_read on ghh.note_activities;
create policy note_activities_read on ghh.note_activities
  as permissive for select to authenticated
  using (((org_id = (select ghh.auth_org())) AND (EXISTS ( SELECT 1
   FROM ghh.notes n
  WHERE ((n.id = note_activities.note_id) AND ghh.can_access_home(n.home_id))))))
;

drop policy if exists note_activities_write on ghh.note_activities;
create policy note_activities_write on ghh.note_activities
  as permissive for all to authenticated
  using (((org_id = (select ghh.auth_org())) AND (EXISTS ( SELECT 1
   FROM ghh.notes n
  WHERE ((n.id = note_activities.note_id) AND ghh.can_access_home(n.home_id) AND (NOT n.locked))))))
  with check (((org_id = (select ghh.auth_org())) AND (EXISTS ( SELECT 1
   FROM ghh.notes n
  WHERE ((n.id = note_activities.note_id) AND ghh.can_access_home(n.home_id) AND (NOT n.locked))))))
;

drop policy if exists note_addenda_insert on ghh.note_addenda;
create policy note_addenda_insert on ghh.note_addenda
  as permissive for insert to authenticated
  with check (((author_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM ghh.notes n
  WHERE ((n.id = note_addenda.note_id) AND (n.org_id = (select ghh.auth_org())) AND ghh.can_access_home(n.home_id) AND (n.status = 'signed'::ghh.note_status))))))
;

drop policy if exists note_addenda_read on ghh.note_addenda;
create policy note_addenda_read on ghh.note_addenda
  as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM ghh.notes n
  WHERE ((n.id = note_addenda.note_id) AND (n.org_id = (select ghh.auth_org())) AND ghh.can_access_home(n.home_id)))))
;

drop policy if exists note_outcomes_read on ghh.note_outcomes;
create policy note_outcomes_read on ghh.note_outcomes
  as permissive for select to authenticated
  using (((org_id = (select ghh.auth_org())) AND (EXISTS ( SELECT 1
   FROM ghh.notes n
  WHERE ((n.id = note_outcomes.note_id) AND ghh.can_access_home(n.home_id))))))
;

drop policy if exists note_outcomes_write on ghh.note_outcomes;
create policy note_outcomes_write on ghh.note_outcomes
  as permissive for all to authenticated
  using (((org_id = (select ghh.auth_org())) AND (EXISTS ( SELECT 1
   FROM ghh.notes n
  WHERE ((n.id = note_outcomes.note_id) AND ghh.can_access_home(n.home_id) AND (NOT n.locked))))))
  with check (((org_id = (select ghh.auth_org())) AND (EXISTS ( SELECT 1
   FROM ghh.notes n
  WHERE ((n.id = note_outcomes.note_id) AND ghh.can_access_home(n.home_id) AND (NOT n.locked))))))
;

drop policy if exists notes_delete_draft on ghh.notes;
create policy notes_delete_draft on ghh.notes
  as permissive for delete to authenticated
  using (((org_id = (select ghh.auth_org())) AND (author_id = (select auth.uid())) AND (status = 'draft'::ghh.note_status) AND (NOT locked)))
;

drop policy if exists notes_insert on ghh.notes;
create policy notes_insert on ghh.notes
  as permissive for insert to authenticated
  with check (((org_id = (select ghh.auth_org())) AND ghh.can_access_home(home_id) AND (author_id = (select auth.uid())) AND (status = 'draft'::ghh.note_status) AND (NOT locked)))
;

drop policy if exists notes_read on ghh.notes;
create policy notes_read on ghh.notes
  as permissive for select to authenticated
  using (((org_id = (select ghh.auth_org())) AND ghh.can_access_home(home_id)))
;

drop policy if exists notes_update on ghh.notes;
create policy notes_update on ghh.notes
  as permissive for update to authenticated
  using (((org_id = (select ghh.auth_org())) AND ghh.can_access_home(home_id) AND (author_id = (select auth.uid())) AND (NOT locked)))
  with check (((org_id = (select ghh.auth_org())) AND ghh.can_access_home(home_id) AND (author_id = (select auth.uid()))))
;

drop policy if exists org_read on ghh.organizations;
create policy org_read on ghh.organizations
  as permissive for select to authenticated
  using ((id = (select ghh.auth_org())))
;

drop policy if exists org_update_branding on ghh.organizations;
create policy org_update_branding on ghh.organizations
  as permissive for update to authenticated
  using (((id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
  with check (((id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
;

drop policy if exists outcome_activities_read on ghh.outcome_activities;
create policy outcome_activities_read on ghh.outcome_activities
  as permissive for select to authenticated
  using (((org_id = (select ghh.auth_org())) AND (EXISTS ( SELECT 1
   FROM (ghh.resident_outcomes o
     JOIN ghh.residents r ON ((r.id = o.resident_id)))
  WHERE ((o.id = outcome_activities.outcome_id) AND ghh.can_access_home(r.home_id))))))
;

drop policy if exists outcome_activities_write on ghh.outcome_activities;
create policy outcome_activities_write on ghh.outcome_activities
  as permissive for all to authenticated
  using (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
  with check (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
;

drop policy if exists profiles_read on ghh.profiles;
create policy profiles_read on ghh.profiles
  as permissive for select to authenticated
  using (((id = (select auth.uid())) OR ((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor()))))
;

drop policy if exists profiles_self_update on ghh.profiles;
create policy profiles_self_update on ghh.profiles
  as permissive for update to authenticated
  using ((id = (select auth.uid())))
  with check (((id = (select auth.uid())) AND (org_id = (select ghh.auth_org())) AND (role = (select ghh.auth_role())) AND active))
;

drop policy if exists profiles_write_org on ghh.profiles;
create policy profiles_write_org on ghh.profiles
  as permissive for update to authenticated
  using (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
  with check (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
;

drop policy if exists resident_outcomes_read on ghh.resident_outcomes;
create policy resident_outcomes_read on ghh.resident_outcomes
  as permissive for select to authenticated
  using (((org_id = (select ghh.auth_org())) AND (EXISTS ( SELECT 1
   FROM ghh.residents r
  WHERE ((r.id = resident_outcomes.resident_id) AND ghh.can_access_home(r.home_id))))))
;

drop policy if exists resident_outcomes_write on ghh.resident_outcomes;
create policy resident_outcomes_write on ghh.resident_outcomes
  as permissive for all to authenticated
  using (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
  with check (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
;

drop policy if exists residents_read on ghh.residents;
create policy residents_read on ghh.residents
  as permissive for select to authenticated
  using (((org_id = (select ghh.auth_org())) AND ghh.can_access_home(home_id)))
;

drop policy if exists residents_write on ghh.residents;
create policy residents_write on ghh.residents
  as permissive for all to authenticated
  using (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
  with check (((org_id = (select ghh.auth_org())) AND (select ghh.is_supervisor())))
;

drop policy if exists shifts_read on ghh.shifts;
create policy shifts_read on ghh.shifts
  as permissive for select to authenticated
  using (((org_id = (select ghh.auth_org())) AND ghh.can_access_home(home_id)))
;

drop policy if exists staff_homes_read on ghh.staff_homes;
create policy staff_homes_read on ghh.staff_homes
  as permissive for select to authenticated
  using ((ghh.home_in_my_org(home_id) AND ((profile_id = (select auth.uid())) OR (select ghh.is_supervisor()))))
;

drop policy if exists staff_homes_write on ghh.staff_homes;
create policy staff_homes_write on ghh.staff_homes
  as permissive for all to authenticated
  using (((select ghh.is_supervisor()) AND (EXISTS ( SELECT 1
   FROM ghh.homes h
  WHERE ((h.id = staff_homes.home_id) AND (h.org_id = (select ghh.auth_org())))))))
  with check (((select ghh.is_supervisor()) AND (EXISTS ( SELECT 1
   FROM ghh.homes h
  WHERE ((h.id = staff_homes.home_id) AND (h.org_id = (select ghh.auth_org())))))))
;

-- The audit trail is queried "this org, newest first" and had no index that
-- matched: only (entity, entity_id, at) and (actor_id, at). Even with the
-- InitPlan fix above the read is a sequential scan.
create index if not exists audit_log_org_at_idx on ghh.audit_log(org_id, at desc);
