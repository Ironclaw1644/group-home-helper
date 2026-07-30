import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createInvitation } from '@/lib/onboarding/invites';

const InviteBody = z.object({
  homeId: z.string().uuid().nullable(),
  role: z.enum(['dsp', 'supervisor', 'admin']),
  title: z.string().trim().min(1).max(60),
  email: z.string().email().max(200).nullable().optional(),
  maxUses: z.number().int().min(1).max(200).optional(),
  lifetimeDays: z.number().int().min(1).max(90).optional()
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can invite staff.' },
      { status: 403 }
    );
  }

  const parsed = InviteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 });
  }

  // Only an admin may mint another admin. Otherwise a supervisor could invite
  // an admin account and then sign in as it, which is a promotion in disguise.
  if (parsed.data.role === 'admin' && session.profile.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only an administrator can invite another administrator.' },
      { status: 403 }
    );
  }

  const result = await createInvitation({
    ...parsed.data,
    orgId: session.profile.orgId,
    createdBy: session.profile.id
  });

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ code: result.code });
}
