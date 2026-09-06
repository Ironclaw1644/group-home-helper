-- staff_homes_read was written in 0002, before the app was multi-tenant, and
-- was never revisited. Its predicate is:
--
--   using (profile_id = auth.uid() or ghh.is_supervisor())
--
-- ghh.is_supervisor() answers "is the caller a supervisor or admin" — it says
-- nothing about *which* organization. staff_homes has no org_id of its own, so
-- there was nothing else in the predicate holding the tenant boundary. Any
-- supervisor or admin at any agency could therefore select every staff-to-home
-- assignment row on the platform, for every other agency.
--
-- The matching write policy (0012_self_service.sql) already scopes correctly by
-- joining through homes. This brings the read path to the same standard.
--
-- Only one organization exists in production today, so nothing was exposed in
-- practice. This lands before a second one does.

-- A security-definer lookup rather than an inline subquery on ghh.homes: the
-- homes read policy calls ghh.can_access_home(), which itself reads
-- staff_homes. Keeping this function definer-rights avoids putting a policy on
-- staff_homes in the position of triggering the policy on homes.
create or replace function ghh.home_in_my_org(target_home uuid)
returns boolean
language sql
stable
security definer
set search_path = ghh, public, pg_temp
as $$
  select exists (
    select 1
    from ghh.homes h
    where h.id = target_home
      and h.org_id = ghh.auth_org()
  );
$$;

revoke all on function ghh.home_in_my_org(uuid) from public;
grant execute on function ghh.home_in_my_org(uuid) to authenticated;

drop policy if exists staff_homes_read on ghh.staff_homes;
create policy staff_homes_read on ghh.staff_homes
  for select to authenticated
  using (
    ghh.home_in_my_org(home_id)
    and (profile_id = auth.uid() or ghh.is_supervisor())
  );
