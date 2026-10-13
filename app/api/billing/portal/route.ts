import { NextResponse } from 'next/server';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createPortalSession, stripeConfigured } from '@/lib/billing/stripe';

/** Stripe's own billing portal: update a card, see invoices, cancel. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can manage billing.' },
      { status: 403 }
    );
  }

  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Billing is not set up yet.' }, { status: 503 });
  }

  const admin = createSupabaseAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('name, is_demo')
    .eq('id', session.profile.orgId)
    .maybeSingle();

  // The demo sandbox is fictional and deletes itself. Taking a real card for
  // it would bill someone for a workspace that is about to disappear.
  if (org?.is_demo) {
    return NextResponse.json(
      { error: 'This is the demo workspace, so it cannot be subscribed. Set up your own workspace first.' },
      { status: 403 }
    );
  }

  const origin = new URL(req.url).origin;

  try {
    const url = await createPortalSession({
      orgId: session.profile.orgId,
      orgName: org?.name ?? 'Agency',
      email: session.email ?? '',
      returnUrl: `${origin}/billing`
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[billing] portal failed', err);
    return NextResponse.json({ error: 'Could not open the billing portal.' }, { status: 500 });
  }
}
