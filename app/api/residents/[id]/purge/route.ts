import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getResident } from '@/lib/residents/repo';
import { displayName } from '@/lib/types';

/**
 * Permanently delete a resident and everything documented about them.
 *
 * This is the one operation in the app that destroys signed records, so it is
 * fenced on four sides:
 *
 *   1. Administrators only. A supervisor can discharge someone; only an admin
 *      can erase them.
 *   2. The full legal name has to be typed. Not a checkbox — a checkbox is the
 *      kind of thing a person clicks past.
 *   3. `ghh.purge_resident()` writes the audit entry, inside the transaction,
 *      before the first row goes, on a table nothing can update or delete. If
 *      the purge commits, the record of it commits too.
 *   4. Uploaded files are removed afterwards, so nothing is left in storage
 *      pointing at a person who no longer exists.
 *
 * Worth being clear about what this is for: an agency that typed someone in
 * twice, a test resident, or an honoured request to destroy records. It is not
 * the answer to "they moved out" — that is discharge, which keeps the history
 * the state expects the agency to retain.
 */

const Body = z.object({
  /** Must match the resident's full legal name. */
  confirm: z.string().trim().min(1)
});

type PurgeResult = {
  notes: number;
  signedNotes: number;
  addenda: number;
  outcomes: number;
  documents: number;
  documentPaths: string[];
  signaturePaths: string[];
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  if (session.profile.role !== 'admin') {
    return NextResponse.json(
      {
        error:
          'Only an administrator can permanently delete a resident. A supervisor can mark them discharged, which keeps their records.'
      },
      { status: 403 }
    );
  }

  const { id } = await params;

  // getResident reads through the caller's session, so RLS has already
  // confirmed this resident belongs to the administrator's own organisation.
  const resident = await getResident(id);
  if (!resident) return NextResponse.json({ error: 'Resident not found' }, { status: 404 });

  if (resident.isDemo) {
    return NextResponse.json(
      { error: 'The training resident cannot be deleted — example notes are written about them.' },
      { status: 403 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Type the full name to confirm.' }, { status: 400 });
  }

  const expected = `${resident.firstName} ${resident.lastName}`;
  if (parsed.data.confirm.toLowerCase() !== expected.toLowerCase()) {
    return NextResponse.json(
      { error: `That does not match. Type "${expected}" exactly.` },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();

  const { data, error } = await admin.rpc('purge_resident', {
    p_resident_id: id,
    p_actor: session.profile.id,
    p_ip: clientIp(req),
    p_user_agent: req.headers.get('user-agent') ?? null
  });

  if (error) {
    console.error('[residents] purge failed', id, error.message);
    return NextResponse.json(
      { error: 'Could not delete this resident. Nothing was removed.' },
      { status: 400 }
    );
  }

  const result = data as PurgeResult;

  // The rows are gone and committed. Files are cleaned up on a best-effort
  // basis: a failure here leaves an orphaned object in a private bucket that
  // nothing links to, which is worth reporting but not worth failing over —
  // the caller would have no way to retry a transaction that already committed.
  await removeFiles(admin, 'ghh-documents', result.documentPaths);
  await removeFiles(admin, 'ghh-signatures', result.signaturePaths);

  return NextResponse.json({
    ok: true,
    name: displayName(resident),
    deleted: {
      notes: result.notes,
      signedNotes: result.signedNotes,
      addenda: result.addenda,
      outcomes: result.outcomes,
      documents: result.documents
    }
  });
}

async function removeFiles(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  bucket: string,
  paths: string[]
): Promise<void> {
  const wanted = (paths ?? []).filter(Boolean);
  if (!wanted.length) return;

  const { error } = await admin.storage.from(bucket).remove(wanted);
  if (error) console.error('[residents] purge left files in', bucket, error.message);
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip');
}
