-- Per-agency pricing.
--
-- A single global STRIPE_PRICE_ID cannot express what a real SaaS needs on day
-- one: the first customer who supplied the domain knowledge is on a different
-- rate from whoever signs up next. This column overrides the default; null
-- means "use the public price", so nothing breaks for orgs that never get one.
alter table ghh.organizations
  add column if not exists stripe_price_id text null;

comment on column ghh.organizations.stripe_price_id is
  'Overrides STRIPE_PRICE_ID for this agency. Null = the public price. Set for design partners and negotiated rates.';

-- A note about who is on a special rate and why, so a future admin does not
-- have to reverse-engineer it from Stripe.
alter table ghh.organizations
  add column if not exists billing_note text null;
