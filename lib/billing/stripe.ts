import 'server-only';

import Stripe from 'stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Stripe subscription billing for the note assistant.
 *
 * What is paid for is deliberately narrow: the AI draft button, and nothing
 * else. The roster, chip form, signing, immutability, duplicate detection,
 * PDFs, exports, and the audit log all keep working whether or not anyone has
 * ever paid. An agency that lapses must still be able to document a shift —
 * an undocumented shift is unbillable to Medicaid and, more to the point, a
 * resident with no record of their care that day.
 */

export const FREE_ALLOWANCE = 10;

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('Missing env var: STRIPE_SECRET_KEY');
    client = new Stripe(key);
  }
  return client;
}

export type BillingState = {
  status: 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';
  periodEnd: string | null;
  generationsUsed: number;
  freeAllowance: number;
  /** True when a draft can be generated right now. */
  entitled: boolean;
  /** Free drafts left, when running on the allowance rather than a plan. */
  freeRemaining: number;
  hasCustomer: boolean;
};

/**
 * Read an org's billing state.
 *
 * Uses the admin client because the entitlement decision must not depend on
 * the caller's policies — a DSP has to be told whether the agency's plan is
 * active without being able to read or change billing.
 */
export async function getBillingState(orgId: string): Promise<BillingState> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('organizations')
    .select(
      'subscription_status, subscription_period_end, ai_generations_used, stripe_customer_id'
    )
    .eq('id', orgId)
    .maybeSingle();

  const status = (data?.subscription_status ?? 'none') as BillingState['status'];
  const used = Number(data?.ai_generations_used ?? 0);
  const periodEnd = (data?.subscription_period_end as string | null) ?? null;

  const paid =
    status === 'active' ||
    status === 'trialing' ||
    // A lapsed card keeps working to the end of the paid period rather than
    // cutting off mid-shift.
    (status === 'past_due' && periodEnd !== null && new Date(periodEnd) > new Date());

  const freeRemaining = Math.max(0, FREE_ALLOWANCE - used);

  return {
    status,
    periodEnd,
    generationsUsed: used,
    freeAllowance: FREE_ALLOWANCE,
    entitled: paid || freeRemaining > 0,
    freeRemaining,
    hasCustomer: Boolean(data?.stripe_customer_id)
  };
}

/** Count a generation. Called only after a draft was actually produced. */
export async function recordGeneration(orgId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin.rpc('record_ai_generation', { p_org_id: orgId });
}

/**
 * The Stripe customer for an org, created on first use.
 *
 * The org id goes into metadata so a webhook can find its way back here even if
 * the local record is somehow missing the subscription id.
 */
export async function ensureCustomer(input: {
  orgId: string;
  orgName: string;
  email: string;
}): Promise<string> {
  const admin = createSupabaseAdminClient();

  const { data } = await admin
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', input.orgId)
    .maybeSingle();

  if (data?.stripe_customer_id) return data.stripe_customer_id;

  const customer = await getStripe().customers.create({
    name: input.orgName,
    email: input.email,
    metadata: { org_id: input.orgId, app: 'group-home-helper' }
  });

  await admin
    .from('organizations')
    .update({ stripe_customer_id: customer.id })
    .eq('id', input.orgId);

  return customer.id;
}

/**
 * Apply a subscription's current state to the org.
 *
 * Called from the webhook, which is the only thing that decides entitlement.
 * Checkout completing in the browser is not proof of payment — the browser can
 * be closed, replayed, or lied to.
 */
export async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const admin = createSupabaseAdminClient();

  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  // Prefer the org id Stripe is carrying for us; fall back to the customer id.
  const orgId = subscription.metadata?.org_id ?? null;

  // `current_period_end` lives on the subscription item in recent API versions
  // and on the subscription itself in older ones. Read whichever is present so
  // this does not silently store null and cut someone off early.
  const item = subscription.items?.data?.[0] as { current_period_end?: number } | undefined;
  const periodEndUnix =
    item?.current_period_end ??
    (subscription as unknown as { current_period_end?: number }).current_period_end ??
    null;

  const patch = {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    subscription_period_end: periodEndUnix
      ? new Date(periodEndUnix * 1000).toISOString()
      : null
  };

  const query = admin.from('organizations').update(patch);
  if (orgId) await query.eq('id', orgId);
  else await query.eq('stripe_customer_id', customerId);
}

/** Checkout session for a new subscription. */
export async function createCheckoutSession(input: {
  orgId: string;
  orgName: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) throw new Error('Missing env var: STRIPE_PRICE_ID');

  const customerId = await ensureCustomer(input);

  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // Carried onto the subscription so the webhook can attribute it without a
    // lookup, and so a customer created outside this flow still resolves.
    subscription_data: {
      metadata: { org_id: input.orgId, app: 'group-home-helper' }
    },
    metadata: { org_id: input.orgId },
    allow_promotion_codes: true
  });

  if (!session.url) throw new Error('Stripe returned a session with no URL');
  return session.url;
}

/** Billing portal, where an agency updates a card or cancels. */
export async function createPortalSession(input: {
  orgId: string;
  orgName: string;
  email: string;
  returnUrl: string;
}): Promise<string> {
  const customerId = await ensureCustomer(input);

  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: input.returnUrl
  });

  return session.url;
}

/**
 * The plan's price, read from Stripe rather than stored here.
 *
 * A price duplicated in the app is a price that will eventually disagree with
 * the one actually charged, and the version the customer sees before clicking
 * should be the version they get billed.
 */
export async function getPlanPrice(): Promise<{ amount: string; interval: string } | null> {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId || !process.env.STRIPE_SECRET_KEY) return null;

  try {
    const price = await getStripe().prices.retrieve(priceId);
    if (price.unit_amount === null) return null;

    const amount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: price.currency.toUpperCase(),
      // Whole-dollar plans should read "$39", not "$39.00".
      minimumFractionDigits: price.unit_amount % 100 === 0 ? 0 : 2
    }).format(price.unit_amount / 100);

    return { amount, interval: price.recurring?.interval ?? 'month' };
  } catch (err) {
    console.error('[billing] could not read the price', err);
    return null;
  }
}
