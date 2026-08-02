import 'server-only';

import { randomUUID } from 'node:crypto';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { DocumentKind, ResidentDocument } from '@/lib/types';

/**
 * Resident and agency documents.
 *
 * Bytes live in the private `ghh-documents` bucket; this table is the index and
 * the access boundary. Nothing in the bucket is world-readable — every download
 * goes through a short-lived signed URL issued only after the row has been read
 * under the caller's own RLS.
 */

const BUCKET = 'ghh-documents';

/** How long a download link lives. Long enough to open, short enough to leak badly. */
const SIGNED_URL_SECONDS = 300;

const COLUMNS =
  'id, org_id, resident_id, title, kind, description, storage_path, mime_type, ' +
  'size_bytes, effective_on, expires_on, uploaded_by, created_at';

function toDocument(r: Record<string, unknown>): ResidentDocument {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    residentId: (r.resident_id as string | null) ?? null,
    title: r.title as string,
    kind: (r.kind as DocumentKind) ?? 'other',
    description: (r.description as string | null) ?? null,
    storagePath: r.storage_path as string,
    mimeType: (r.mime_type as string | null) ?? null,
    sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes),
    effectiveOn: (r.effective_on as string | null) ?? null,
    expiresOn: (r.expires_on as string | null) ?? null,
    uploadedBy: (r.uploaded_by as string | null) ?? null,
    createdAt: r.created_at as string
  };
}

export async function listDocuments(options: {
  residentId?: string;
  /** Agency-level documents (no resident). */
  agencyOnly?: boolean;
  kind?: DocumentKind;
}): Promise<ResidentDocument[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from('documents').select(COLUMNS);

  if (options.residentId) q = q.eq('resident_id', options.residentId);
  else if (options.agencyOnly) q = q.is('resident_id', null);
  if (options.kind) q = q.eq('kind', options.kind);

  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toDocument);
}

export async function getDocument(id: string): Promise<ResidentDocument | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('documents').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toDocument(data as unknown as Record<string, unknown>) : null;
}

/**
 * A one-off upload URL the browser can PUT to directly.
 *
 * Routing file bytes through a serverless function would cap uploads at a few
 * megabytes and bill the transfer twice. The path is generated here rather than
 * accepted from the client, so a caller cannot choose where their bytes land or
 * overwrite somebody else's document.
 */
export async function createUploadTarget(input: {
  orgId: string;
  residentId: string | null;
  fileName: string;
}): Promise<{ path: string; token: string } | { error: string }> {
  const safeName = input.fileName.replace(/[^\w.\- ]+/g, '_').slice(-120) || 'document';
  const path = `${input.orgId}/${input.residentId ?? 'agency'}/${randomUUID()}-${safeName}`;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);

  if (error || !data) {
    return { error: 'Could not prepare the upload. Try again.' };
  }
  return { path: data.path, token: data.token };
}

export async function recordDocument(input: {
  orgId: string;
  residentId: string | null;
  title: string;
  kind: DocumentKind;
  description?: string | null;
  storagePath: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  effectiveOn?: string | null;
  expiresOn?: string | null;
  uploadedBy: string;
}): Promise<{ id: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('documents')
    .insert({
      org_id: input.orgId,
      resident_id: input.residentId,
      title: input.title.trim(),
      kind: input.kind,
      description: input.description?.trim() || null,
      storage_path: input.storagePath,
      mime_type: input.mimeType || null,
      size_bytes: input.sizeBytes ?? null,
      effective_on: input.effectiveOn || null,
      expires_on: input.expiresOn || null,
      uploaded_by: input.uploadedBy
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '42501') {
      return { error: 'Only a supervisor or administrator can upload documents.' };
    }
    return { error: error.message };
  }
  return { id: data.id };
}

/**
 * A short-lived link to the file.
 *
 * The row is read through the caller's client first, so RLS decides whether
 * they may see this document at all. Only then does the admin client sign a
 * URL — the signature is issued on the strength of a check that already passed.
 */
export async function signedDownloadUrl(
  id: string,
  disposition: 'inline' | 'attachment' = 'inline'
): Promise<string | null> {
  const doc = await getDocument(id);
  if (!doc) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(doc.storagePath, SIGNED_URL_SECONDS, {
      download: disposition === 'attachment' ? doc.title : undefined
    });

  if (error || !data) return null;
  return data.signedUrl;
}

export async function deleteDocument(id: string): Promise<{ ok: true } | { error: string }> {
  const doc = await getDocument(id);
  if (!doc) return { error: 'Document not found.' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('documents').delete().eq('id', id);

  if (error) {
    if (error.code === '42501') {
      return { error: 'Only a supervisor or administrator can remove documents.' };
    }
    return { error: error.message };
  }

  // The row is the access boundary, so it goes first; an orphaned object is
  // unreachable. Removing the bytes is cleanup, and failing at it must not
  // resurrect a document the supervisor believes is gone.
  const admin = createSupabaseAdminClient();
  await admin.storage.from(BUCKET).remove([doc.storagePath]).catch(() => {});

  return { ok: true };
}
