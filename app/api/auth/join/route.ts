import { NextResponse } from 'next/server';
import { z } from 'zod';
import { redeemInvite } from '@/lib/onboarding/provision';

/**
 * Redeem an invitation and create the account.
 *
 * Unauthenticated by design — the join code is the authorization. It is checked
 * server-side against expiry, revocation, use count, and any address the invite
 * was pinned to; the browser is never trusted with any of that.
 *
 * Returns only success. The caller already knows the password it just chose, so
 * it signs in with the normal browser client, which is what sets the session
 * cookies correctly.
 */

const JoinBody = z.object({
  code: z.string().min(1).max(64),
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  fullName: z.string().trim().min(1).max(120)
});

export async function POST(req: Request) {
  const parsed = JoinBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
  }

  const result = await redeemInvite(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
