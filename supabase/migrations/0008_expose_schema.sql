-- Expose the ghh schema to PostgREST so the app can reach it.
--
-- Supabase serves only the schemas listed in the authenticator role's
-- pgrst.db_schemas setting. Without this every query returns
-- "Invalid schema: ghh" regardless of grants or policies.
--
-- The existing schemas are preserved; ghh is appended. That matters here more
-- than usual: this Postgres instance is shared with unrelated projects, so
-- replacing the list rather than extending it would take their APIs down.
--
-- RECONSTRUCTED. This file was missing from the repository; the statements
-- below are the ones actually applied to production on 2026-07-29 as
-- `ghh_0008_expose_schema`, recovered verbatim from the applied migration
-- history.
do $$
declare
  current_schemas text;
begin
  select coalesce(
           (select setting
              from pg_db_role_setting s
              join pg_roles r on r.oid = s.setrole
             cross join lateral unnest(s.setconfig) as setting
             where r.rolname = 'authenticator'
               and setting like 'pgrst.db_schemas=%'
             limit 1),
           'pgrst.db_schemas=public, graphql_public'
         )
    into current_schemas;

  -- Strip the key, leaving just the comma-separated list.
  current_schemas := replace(current_schemas, 'pgrst.db_schemas=', '');

  if position('ghh' in current_schemas) = 0 then
    execute format(
      'alter role authenticator set pgrst.db_schemas = %L',
      current_schemas || ', ghh'
    );
  end if;
end;
$$;

notify pgrst, 'reload config';
