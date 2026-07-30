import { NextResponse } from 'next/server';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { revokeInvitation } from '@/lib/onboarding/invites';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  if (!isSupervisor(session.profile)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const { id } = await params;
  const result = await revokeInvitation(id);

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
