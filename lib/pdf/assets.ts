import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * react-pdf resolves images at render time. Handing it data URLs keeps
 * rendering self-contained — no network fetch mid-render, no dependency on the
 * app being publicly reachable, and no signed URL that could outlive the
 * request.
 */

let cachedLogo: string | null | undefined;

/** The AHFS mark, read once per process. */
export async function loadLogoDataUrl(): Promise<string | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    const file = path.join(process.cwd(), 'public', 'brand', 'AHFS_logo.png');
    const bytes = await readFile(file);
    cachedLogo = `data:image/png;base64,${bytes.toString('base64')}`;
  } catch (err) {
    console.error('[pdf] could not load logo', err);
    cachedLogo = null;
  }
  return cachedLogo;
}

/**
 * Fetch a signature image from the private bucket.
 *
 * Callers must have already established that the requester may see this note;
 * this uses the service role because the bucket denies everyone else.
 */
export async function loadSignatureDataUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath) return null;
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage.from('ghh-signatures').download(storagePath);
    if (error || !data) return null;
    const bytes = Buffer.from(await data.arrayBuffer());
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch (err) {
    console.error('[pdf] could not load signature', storagePath, err);
    return null;
  }
}
