import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { parsePrintFields } from '@/lib/branding/print';

/**
 * An agency's logo: upload target, and the bytes back.
 *
 * The bytes live in the private `ghh-documents` bucket, the same one resident
 * documents use and under the same rule — nothing in it is world-readable, and
 * the object path is issued by the server rather than chosen by the caller, so
 * an agency cannot write into or read from another agency's prefix.
 *
 * A logo is not PHI, but it shares a bucket with files that are, so it is
 * served through this route rather than a public URL. That also means an
 * agency's mark is not sitting on an unauthenticated endpoint for anyone who
 * guesses the path.
 */

const BUCKET = 'ghh-documents';

/** Big enough for a real letterhead mark, small enough to print and load fast. */
const MAX_BYTES = 250_000;

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const Body = z.object({
  fileName: z.string().trim().min(1).max(255),
  // SVG is excluded on purpose: it is a document format that can carry script
  // and external references, and this ends up in an <img> on every page.
  contentType: z.string().trim().refine((v) => ALLOWED_MIME.has(v), 'Use a PNG, JPG, GIF or WebP image.'),
  sizeBytes: z.number().int().positive().max(MAX_BYTES)
});

/** Issue a one-off URL the browser can PUT the logo to. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can change the agency logo.' },
      { status: 403 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'That file cannot be used as a logo.' },
      { status: 400 }
    );
  }

  const safeName = parsed.data.fileName.replace(/[^\w.\- ]+/g, '_').slice(-80) || 'logo';
  // The org prefix is what keeps tenants apart in the bucket, and it is set
  // here rather than accepted from the client.
  const path = `${session.profile.orgId}/branding/${randomUUID()}-${safeName}`;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json({ error: 'Could not prepare the upload. Try again.' }, { status: 500 });
  }

  return NextResponse.json({ path: data.path, token: data.token });
}

/**
 * Serve the caller's own agency logo.
 *
 * The stored path is read under the caller's RLS first, so this can only ever
 * return the logo belonging to the organization the session is in — the object
 * is then fetched with the service role because the bucket denies everyone.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse('Not signed in', { status: 401 });

  const supabase = await createSupabaseServerClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('branding')
    .eq('id', session.profile.orgId)
    .maybeSingle();

  const { logoPath } = parsePrintFields(org?.branding);
  if (!logoPath) return new NextResponse('No logo set', { status: 404 });

  // Defence in depth: the column is only ever written with a server-issued
  // path, but a value that escaped this org's prefix must not be readable.
  if (!logoPath.startsWith(`${session.profile.orgId}/`)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(logoPath);
  if (error || !data) return new NextResponse('Not found', { status: 404 });

  const bytes = Buffer.from(await data.arrayBuffer());
  const mime = ALLOWED_MIME.has(data.type) ? data.type : 'image/png';

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.length),
      // Private: it is served per-session out of a shared private bucket, so
      // it must not be held in a proxy cache that another agency could hit.
      'Cache-Control': 'private, max-age=300'
    }
  });
}
