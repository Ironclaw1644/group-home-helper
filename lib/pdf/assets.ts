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

/**
 * Logos, cached by source rather than process-wide.
 *
 * This used to be a single `cachedLogo` holding one agency's mark, read from
 * disk and handed to every PDF the server rendered. On a multi-tenant install
 * that printed the first agency's logo on the second agency's forms. The cache
 * is keyed by the specific source now, so two orgs cannot collide, and an org
 * with no logo resolves to null rather than to somebody else's.
 */
const logoCache = new Map<string, string | null>();

/** Bound the map so a long-lived server does not accumulate an entry per org forever. */
const LOGO_CACHE_MAX = 64;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

function remember(key: string, value: string | null): string | null {
  if (logoCache.size >= LOGO_CACHE_MAX) {
    const oldest = logoCache.keys().next().value;
    if (oldest !== undefined) logoCache.delete(oldest);
  }
  logoCache.set(key, value);
  return value;
}

/**
 * Resolve an organization's logo to a data URL, or null when it has none.
 *
 * Three shapes are accepted, in the order an agency is likely to have them: a
 * data URL stored inline in `branding` (how logos were first saved), an object
 * in the private documents bucket (how they are saved now), and a same-origin
 * path under `public/` (the shipped marks).
 *
 * Returning null is deliberate and load-bearing. There is no default logo,
 * because the only honest default for an agency that has not uploaded one is
 * nothing at all.
 */
export async function loadLogoDataUrl(source: {
  logoUrl?: string | null;
  logoPath?: string | null;
}): Promise<string | null> {
  const { logoUrl, logoPath } = source;

  // Already inline — nothing to fetch.
  if (logoUrl && logoUrl.startsWith('data:image/')) return logoUrl;

  if (logoPath) {
    const key = `bucket:${logoPath}`;
    const hit = logoCache.get(key);
    if (hit !== undefined) return hit;

    try {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.storage.from('ghh-documents').download(logoPath);
      if (error || !data) return remember(key, null);

      const bytes = Buffer.from(await data.arrayBuffer());
      const mime = data.type && data.type.startsWith('image/') ? data.type : 'image/png';
      return remember(key, `data:${mime};base64,${bytes.toString('base64')}`);
    } catch (err) {
      console.error('[pdf] could not load org logo', logoPath, err);
      return remember(key, null);
    }
  }

  // A shipped same-origin asset, e.g. an agency still pointing at /brand/*.png.
  if (logoUrl && logoUrl.startsWith('/') && !logoUrl.startsWith('//')) {
    const key = `file:${logoUrl}`;
    const hit = logoCache.get(key);
    if (hit !== undefined) return hit;

    try {
      // Resolve inside public/ only. A stored value that climbs out of the
      // directory must not turn into an arbitrary file read on the server.
      const publicDir = path.join(process.cwd(), 'public');
      const target = path.resolve(publicDir, `.${logoUrl.split('?')[0]}`);
      if (!target.startsWith(publicDir + path.sep)) return remember(key, null);

      const mime = MIME_BY_EXTENSION[path.extname(target).toLowerCase()];
      if (!mime) return remember(key, null);

      const bytes = await readFile(target);
      return remember(key, `data:${mime};base64,${bytes.toString('base64')}`);
    } catch (err) {
      console.error('[pdf] could not load logo', logoUrl, err);
      return remember(key, null);
    }
  }

  return null;
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
