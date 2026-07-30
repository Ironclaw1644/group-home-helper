import 'server-only';

import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. Bypasses RLS, so it is used only where the app must act
 * outside a single user's permissions:
 *
 *   - decrypting a Medicaid ID (needs app.phi_key set on the connection)
 *   - writing ai_generations rows
 *   - batch exports that span homes, after an explicit supervisor check
 *
 * Never import this into a Client Component, and never hand it a value that
 * came from the browser without validating it first.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase's newer `sb_secret_*` keys are per-key revocable, so prefer one
  // when present and fall back to a legacy service-role JWT.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase admin client is not configured');
  }
  return createClient(url, key, {
    db: { schema: 'ghh' },
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/**
 * Decrypt a resident's Medicaid ID.
 *
 * The encryption key is passed per-call and set on the connection rather than
 * stored in the database, so ciphertext and key never sit in the same place.
 * Callers must have already confirmed the user may see this resident.
 */
export async function decryptMedicaidId(residentId: string): Promise<string | null> {
  const phiKey = process.env.PHI_ENCRYPTION_KEY;
  if (!phiKey) throw new Error('Missing env var: PHI_ENCRYPTION_KEY');

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('read_medicaid_id', {
    p_resident_id: residentId,
    p_key: phiKey
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}
