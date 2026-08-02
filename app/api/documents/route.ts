import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { recordDocument } from '@/lib/documents/repo';
import { logAccess } from '@/lib/audit';

const Body = z.object({
  residentId: z.string().uuid().nullable(),
  title: z.string().trim().min(1).max(200),
  kind: z.enum(['isp', 'assessment', 'behavioral', 'medical', 'consent', 'legal', 'other']),
  description: z.string().trim().max(2000).nullable().optional(),
  storagePath: z.string().min(1).max(500),
  mimeType: z.string().max(160).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
  effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});

/** Record a document after the browser has uploaded the bytes. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the fields and try again.' }, { status: 400 });
  }

  // The path must be one this org was issued. Without this check a caller could
  // attach a row to another agency's object and read it through the download
  // route, which does trust the row.
  if (!parsed.data.storagePath.startsWith(`${session.profile.orgId}/`)) {
    return NextResponse.json({ error: 'Invalid upload path.' }, { status: 400 });
  }

  const result = await recordDocument({
    ...parsed.data,
    orgId: session.profile.orgId,
    uploadedBy: session.profile.id
  });

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'document.upload', 'document', result.id, {
    resident_id: parsed.data.residentId,
    kind: parsed.data.kind
  });

  return NextResponse.json({ id: result.id });
}
