import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe, syncSubscription } from '@/lib/billing/stripe';

/**
 * Stripe webhook — the only thing that grants or revokes entitlement.
 *
 * Checkout completing in the browser is not proof of payment: that redirect can
 * be closed, replayed, or forged. Stripe telling us server-to-server, with a
 * signature we verify, is.
 *
 * Public by necessity (Stripe has no session), but not unauthenticated — the
 * signature check below is the authentication, and a request that fails it is
 * rejected before anything is read.
 */

// The signature is computed over the exact bytes Stripe sent, so the body must
// not be parsed or re-serialized before verification.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe] STRIPE_WEBHOOK_SECRET is not set; refusing to process');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    // Do not log the body — it is attacker-controlled on a failed verification.
    console.error('[stripe] signature verification failed', err instanceof Error ? err.message : '');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;

      case 'checkout.session.completed': {
        // The subscription object on this event is only an id, so fetch it to
        // get the status and period end rather than assuming "active".
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;

        if (subscriptionId) {
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
          await syncSubscription(subscription);
        }
        break;
      }

      case 'invoice.payment_failed':
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | { id: string };
        };
        const subscriptionId =
          typeof invoice.subscription === 'string'
            ? invoice.subscription
            : invoice.subscription?.id;

        if (subscriptionId) {
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
          await syncSubscription(subscription);
        }
        break;
      }

      default:
        // Everything else is ignored on purpose. Stripe retries on non-2xx, so
        // returning an error for events we do not handle would produce an
        // endless retry loop for normal account activity.
        break;
    }
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want for a transient database
    // failure — the alternative is silently losing someone's subscription.
    console.error('[stripe] handler failed', event.type, err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
