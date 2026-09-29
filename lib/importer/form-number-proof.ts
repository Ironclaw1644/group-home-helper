import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Binds a form number to "the server read this off this org's upload and the
 * registry verified it".
 *
 * The review screen round-trips the draft through the browser, and a browser
 * can send anything. Without this, a confirmed template could carry any
 * registry number an admin typed — which is the Form #680 failure again, just
 * with a real number on the wrong document. The import route signs what it
 * resolved; the confirm route keeps a number only if the signature verifies.
 */
function key(): string {
  const k = process.env.PHI_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error('No server secret available to sign form numbers.');
  return k;
}

function mac(orgId: string, formNumber: string): string {
  return createHmac('sha256', key()).update(`form-number:v1:${orgId}:${formNumber}`).digest('hex');
}

export function signFormNumber(orgId: string, formNumber: string | null): string | null {
  return formNumber ? mac(orgId, formNumber) : null;
}

export function verifyFormNumber(orgId: string, formNumber: string | null, proof: string | null): boolean {
  if (!formNumber || !proof || !/^[0-9a-f]{64}$/.test(proof)) return false;
  const want = Buffer.from(mac(orgId, formNumber), 'hex');
  const got = Buffer.from(proof, 'hex');
  return want.length === got.length && timingSafeEqual(want, got);
}
