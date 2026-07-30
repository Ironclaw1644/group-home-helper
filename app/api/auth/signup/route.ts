import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAgency } from '@/lib/onboarding/provision';

/**
 * Create a new agency and its first administrator.
 *
 * Unauthenticated: this is the front door for a group home that found the site
 * and wants their own workspace. The org it creates starts completely empty —
 * no residents, no other staff — so a bad-faith signup gets a blank workspace
 * and no reach into anyone else's data.
 */

const SignupBody = z.object({
  orgName: z.string().trim().min(2).max(120),
  homeName: z.string().trim().max(120).default('Main House'),
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  fullName: z.string().trim().min(1).max(120),
  timezone: z.string().max(64).optional()
});

export async function POST(req: Request) {
  const parsed = SignupBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' },
      { status: 400 }
    );
  }

  const result = await createAgency(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
