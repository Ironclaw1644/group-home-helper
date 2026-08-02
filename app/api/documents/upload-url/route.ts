import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createUploadTarget } from '@/lib/documents/repo';

const Body = z.object({
  residentId: z.string().uuid().nullable(),
  fileName: z.string().trim().min(1).max(255)
});

/** Hand the browser a one-off URL to PUT the file to. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can upload documents.' },
      { status: 403 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const result = await createUploadTarget({
    orgId: session.profile.orgId,
    residentId: parsed.data.residentId,
    fileName: parsed.data.fileName
  });

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json(result);
}
