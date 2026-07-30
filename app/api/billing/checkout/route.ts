import { NextResponse } from 'next/server';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createCheckoutSession, stripeConfigured } from '@/lib/billing/stripe';

/** Start a subscription. Supervisors and admins only — this spends money. */
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
    return NextResponse.json(
      { error: 'Billing is not set up yet. An administrator needs to add the Stripe keys.' },
      { status: 503 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', session.profile.orgId)
    .maybeSingle();

  // Build absolute URLs from the request rather than an env var, so this works
  // on preview deployments and localhost without extra configuration.
  const origin = new URL(req.url).origin;

  try {
    const url = await createCheckoutSession({
      orgId: session.profile.orgId,
      orgName: org?.name ?? 'Agency',
      email: session.email ?? '',
      successUrl: `${origin}/billing?started=1`,
      cancelUrl: `${origin}/billing`
    });
    return NextResponse.json({ url });
  } catch (err) {
    console.error('[billing] checkout failed', err);
    return NextResponse.json({ error: 'Could not start checkout. Try again.' }, { status: 500 });
  }
}
