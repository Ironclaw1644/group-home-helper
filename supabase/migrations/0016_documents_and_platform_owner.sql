-- Documents, and the agency that owns the product.
--
-- Documents: ISPs, assessments, consents, behaviour plans. Bytes live in the
-- private ghh-documents bucket; this table is the index and the access
-- boundary. A DSP may read documents for residents in their homes — the ISP is
-- the point of the feature and they need it on shift — but only a supervisor
-- may upload or remove one, because a misfiled ISP is a compliance problem.
--
-- Platform ownership: the agency that owns the product is never billed.
-- Deliberately NOT a cross-tenant read grant. Owning the software does not
-- create a treatment relationship with another agency's residents, so the flag
-- must never widen access to their PHI. RLS stays scoped by org_id for
-- everyone, owner included.
--
-- RECONSTRUCTED. This file used to end "(Applied via the Supabase migration
-- API)" and contained no SQL at all, so ghh.documents, its policies and the
-- ghh-documents bucket had no DDL anywhere in the repository. The statements
-- below are the ones actually applied to production on 2026-08-02 as
-- `documents_and_platform_owner`, recovered verbatim from the applied
-- migration history. See 0015 for the outcomes half.

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------

create table if not exists ghh.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references ghh.organizations(id) on delete cascade,
  -- Null means an agency-level document (policies, licences) rather than one
  -- belonging to a person.
  resident_id uuid null references ghh.residents(id) on delete cascade,
  title text not null,
  -- isp | assessment | consent | medical | behavioral | legal | other
  kind text not null default 'other',
  description text null,
  storage_path text not null unique,
  mime_type text null,
  size_bytes bigint null,
  -- Plans and consents expire; a supervisor needs to see that coming.
  effective_on date null,
  expires_on date null,
  uploaded_by uuid null references ghh.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_resident on ghh.documents (resident_id, kind, created_at desc);
create index if not exists documents_org on ghh.documents (org_id, created_at desc);
create index if not exists documents_expiry on ghh.documents (expires_on) where expires_on is not null;

comment on table ghh.documents is
  'Resident and agency documents. Bytes live in the private ghh-documents bucket; this table is the index and the access boundary.';

alter table ghh.documents enable row level security;

-- A DSP may read documents for residents in their homes — the ISP is the point
-- of the feature, and they need it on shift.
drop policy if exists documents_read on ghh.documents;
create policy documents_read on ghh.documents
  for select to authenticated
  using (
    org_id = ghh.auth_org()
    and (
      resident_id is null
      or exists (
        select 1 from ghh.residents r
        where r.id = resident_id and ghh.can_access_home(r.home_id)
      )
    )
  );

-- Uploading and deleting is a supervisor act. A misfiled or removed ISP is a
-- compliance problem, not a clerical one.
drop policy if exists documents_write on ghh.documents;
create policy documents_write on ghh.documents
  for all to authenticated
  using (org_id = ghh.auth_org() and ghh.is_supervisor())
  with check (org_id = ghh.auth_org() and ghh.is_supervisor());

grant select, insert, update, delete on ghh.documents to authenticated;
grant all privileges on ghh.documents to service_role;

-- Private bucket. Nothing is world-readable; the app hands out short-lived
-- signed URLs after checking the row above.
insert into storage.buckets (id, name, public)
values ('ghh-documents', 'ghh-documents', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Platform ownership
-- ---------------------------------------------------------------------------

-- The agency that owns the product. Exempt from billing permanently.
--
-- Deliberately NOT a cross-tenant read grant. Owning the software does not
-- create a treatment relationship with another agency's residents, so this flag
-- must never widen access to their PHI — RLS stays scoped by org_id for
-- everyone, owner included.
alter table ghh.organizations
  add column if not exists is_platform_owner boolean not null default false;

comment on column ghh.organizations.is_platform_owner is
  'Owns the product: never billed. Grants no access to other agencies data — RLS is still per-org.';

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
  select subscription_status, subscription_period_end, ai_generations_used, is_platform_owner
    into org
  from ghh.organizations
  where id = p_org_id;

  if not found then
    return false;
  end if;

  -- The owner is never billed and never metered.
  if org.is_platform_owner then
    return true;
  end if;

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

-- At Home Family Services owns this product.
update ghh.organizations
set is_platform_owner = true,
    stripe_price_id = null,
    billing_note = 'Platform owner — free permanently. Supplied Form #680, the workflow, and the first real usage data.'
where id = '00000000-0000-0000-0000-000000000001';

notify pgrst, 'reload schema';
