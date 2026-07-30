import { NextResponse } from 'next/server';
import { createDemoSandbox } from '@/lib/onboarding/provision';

/**
 * Start a demo sandbox.
 *
 * Returns generated credentials so the browser can sign in with them. That is
 * safe here in a way it would not normally be: the account was created by this
 * request, belongs to nobody, and can only ever reach an org containing three
 * fictional people. It expires on its own.
 */
export async function POST() {
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
