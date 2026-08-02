import { NextResponse } from 'next/server';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { deleteDocument, signedDownloadUrl } from '@/lib/documents/repo';
import { logAccess } from '@/lib/audit';

/**
 * Redirect to a short-lived signed URL.
 *
 * Opening a resident's document is a PHI read, so it is logged before the
 * redirect rather than after — a link that is followed and never recorded is
 * exactly what an audit trail exists to prevent.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;
  const download = new URL(req.url).searchParams.get('download') === '1';

  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, download ? 'document.download' : 'document.view', 'document', id, {});

  const url = await signedDownloadUrl(id, download ? 'attachment' : 'inline');
  if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.redirect(url);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
  }

  const { id } = await params;
  const result = await deleteDocument(id);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'document.delete', 'document', id, {});

  return NextResponse.json({ ok: true });
}
