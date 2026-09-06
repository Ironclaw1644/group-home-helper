import { NextResponse } from 'next/server';
import { createDemoSandbox } from '@/lib/onboarding/provision';
import { reapExpiredDemos } from '@/lib/onboarding/demo-reaper';

/**
 * Start a demo sandbox.
 *
 * Returns generated credentials so the browser can sign in with them. That is
 * safe here in a way it would not normally be: the account was created by this
 * request, belongs to nobody, and can only ever reach an org containing three
 * fictional people. It expires on its own — and now something actually enforces
 * that.
 */
export async function POST() {
  // Clear the expired sandboxes before making another. They have always
  // carried an expires_at and there has always been a prune command, but
  // nothing ever ran it and the prune was broken anyway, so sixteen dead demo
  // agencies accumulated in production next to the one real customer. Doing it
  // here puts the cleanup on the same traffic as the mess, and it needs nobody
  // to remember.
  //
  // Awaited rather than left running: this is serverless, where the process can
  // be frozen the moment the response is sent. In the normal case it is one
  // query that matches nothing.
  try {
    const reaped = await reapExpiredDemos();
    if (reaped.length > 0) console.log('[demo] reaped %d expired sandbox(es)', reaped.length);
  } catch (err) {
    // A failed sweep must not stop somebody seeing the product.
    console.error('[demo] sweep failed', err);
  }

  const result = await createDemoSandbox();

  if (!result.ok) {
    // 429 rather than 500 — the usual reason to land here is the hourly cap,
    // and "try again shortly" is genuinely the right advice.
    return NextResponse.json({ error: result.error }, { status: 429 });
  }

  return NextResponse.json({
    ok: true,
    email: result.email,
    password: result.password
  });
}
