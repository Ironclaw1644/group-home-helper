-- Subscription billing for the note assistant.
--
-- Only the AI draft button is paid. Everything that makes this a compliance
-- system — the roster, the chip form, signing, immutability, duplicate
-- detection, PDFs, the audit log, exports — stays free and always works. A
-- house that stops paying must never lose the ability to document a shift,
-- because an undocumented shift is an unbillable one and, more importantly, a
-- resident with no record of their care that day.

alter table ghh.organizations
  add column if not exists stripe_customer_id text null,
  add column if not exists stripe_subscription_id text null,
  -- none | trialing | active | past_due | canceled
  add column if not exists subscription_status text not null default 'none',
  add column if not exists subscription_period_end timestamptz null,
  -- Lifetime count, used to give demo and unsubscribed orgs a small taste.
  add column if not exists ai_generations_used integer not null default 0;

comment on column ghh.organizations.subscription_status is
  'Gates the AI draft button only. Every other feature works regardless.';

create unique index if not exists organizations_stripe_customer
  on ghh.organizations (stripe_customer_id) where stripe_customer_id is not null;

create index if not exists organizations_stripe_subscription
  on ghh.organizations (stripe_subscription_id) where stripe_subscription_id is not null;

-- ---------------------------------------------------------------------------
-- Entitlement
-- ---------------------------------------------------------------------------

-- Free AI drafts before a subscription is required. Enough to see that it
-- works and decide, not enough to run a house on.
create or replace function ghh.free_ai_allowance()
returns integer language sql immutable as $$ select 10 $$;

/**
 * Whether an org may generate a draft right now.
 *
 * SECURITY DEFINER so it can read the billing columns regardless of the
 * caller's policies, and STABLE so it can be used in a policy later without
 * re-running per row.
 */
create or replace function ghh.can_use_ai(p_org_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ghh, public
as $$
declare
  org record;
begin
  select subscription_status, subscription_period_end, ai_generations_used
    into org
  from ghh.organizations
  where id = p_org_id;

  if not found then
    return false;
  end if;

  -- A canceled subscription keeps working until the period they paid for ends.
  -- Cutting access the moment someone clicks cancel would take away something
  -- already paid for.
  if org.subscription_status in ('active', 'trialing') then
    return true;
  end if;

  if org.subscription_status = 'past_due'
     and org.subscription_period_end is not null
     and org.subscription_period_end > now() then
    return true;
  end if;

  return coalesce(org.ai_generations_used, 0) < ghh.free_ai_allowance();
end;
$$;

grant execute on function ghh.can_use_ai(uuid) to authenticated, service_role;
grant execute on function ghh.free_ai_allowance() to authenticated, service_role;

/**
 * Count one generation.
 *
 * Separate from can_use_ai so the count only moves when a draft was actually
 * produced — a model error should not consume someone's free allowance.
 */
create or replace function ghh.record_ai_generation(p_org_id uuid)
returns integer
language plpgsql
security definer
set search_path = ghh, public
as $$
declare
  used integer;
begin
  update ghh.organizations
  set ai_generations_used = coalesce(ai_generations_used, 0) + 1
  where id = p_org_id
  returning ai_generations_used into used;

  return coalesce(used, 0);
end;
$$;

revoke all on function ghh.record_ai_generation(uuid) from public, authenticated, anon;
grant execute on function ghh.record_ai_generation(uuid) to service_role;

-- Supervisors need to read their own org's billing state to render the billing
-- page. The existing organizations policy already scopes to auth_org().
grant update on ghh.organizations to authenticated;
