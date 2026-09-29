import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Every name in an agency that could identify a resident if it reached a
 * hosted model: colleagues, housemates, houses and their addresses, the
 * agency itself. Input to buildRedactor (deid.ts).
 *
 * Read with the service role because a DSP cannot list every colleague under
 * RLS, and a name the redactor was never told about is a name it cannot
 * remove. Scoped to one org by an explicit filter; the result never leaves the
 * server.
 */
export async function loadRedactionNames(
  orgId: string,
  residentId: string
): Promise<{ staff: string[]; peers: string[]; places: string[] }> {
  const admin = createSupabaseAdminClient();
  const [profiles, residents, homes, org] = await Promise.all([
    admin.from('profiles').select('full_name').eq('org_id', orgId),
    admin
      .from('residents')
      .select('id, first_name, last_name, preferred_name')
      .eq('org_id', orgId)
      .neq('id', residentId),
    admin.from('homes').select('name, address').eq('org_id', orgId),
    admin.from('organizations').select('name, legal_name').eq('id', orgId).maybeSingle()
  ]);

  // Fail closed: a redactor missing half its list would let those names out.
  const failed = [profiles, residents, homes, org].find((r) => r.error);
  if (failed?.error) throw failed.error;

  return {
    staff: (profiles.data ?? []).map((p) => p.full_name as string),
    peers: (residents.data ?? []).flatMap((r) => [
      [r.first_name, r.last_name].filter(Boolean).join(' '),
      (r.preferred_name as string | null) ?? ''
    ]),
    places: [
      ...(homes.data ?? []).flatMap((h) => [h.name as string, (h.address as string | null) ?? '']),
      (org.data?.name as string | undefined) ?? '',
      (org.data?.legal_name as string | null | undefined) ?? ''
    ].filter(Boolean)
  };
}
