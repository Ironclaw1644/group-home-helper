import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { ResidentRecord, ResidentSort } from '@/lib/types';

/**
 * Resident roster reads and writes.
 *
 * Reads go through the user's own client so RLS scopes them: a DSP sees the
 * homes they are assigned to, a supervisor sees the org. Writes that touch a
 * Medicaid ID additionally need the admin client, because the encrypt/decrypt
 * functions are granted to service_role only — the browser must never be able
 * to call them directly.
 */

const COLUMNS =
  'id, org_id, home_id, first_name, last_name, preferred_name, room, grouping, ' +
  'dob, pronoun_subject, pronoun_object, pronoun_possessive, is_demo, active, ' +
  'discharged_on, medicaid_id_demo, created_at';

function toRecord(r: Record<string, unknown>): ResidentRecord {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    homeId: r.home_id as string,
    firstName: r.first_name as string,
    lastName: r.last_name as string,
    preferredName: (r.preferred_name as string | null) ?? null,
    room: (r.room as string | null) ?? null,
    grouping: (r.grouping as string | null) ?? null,
    dob: (r.dob as string | null) ?? null,
    pronouns: {
      subject: r.pronoun_subject as string,
      object: r.pronoun_object as string,
      possessive: r.pronoun_possessive as string
    },
    isDemo: Boolean(r.is_demo),
    active: Boolean(r.active),
    dischargedOn: (r.discharged_on as string | null) ?? null,
    // Only ever the fictional demo value. A real ID is encrypted and is not
    // returned by list queries at all.
    demoMedicaidId: (r.medicaid_id_demo as string | null) ?? null,
    createdAt: r.created_at as string
  };
}

export type ResidentQuery = {
  homeId?: string;
  /** Free text across first, last, and preferred name, plus room. */
  search?: string;
  grouping?: string;
  /** 'active' (default), 'inactive', or 'all'. */
  status?: 'active' | 'inactive' | 'all';
  sort?: ResidentSort;
};

/**
 * List residents the signed-in user may see.
 *
 * Filtering and sorting run in Postgres rather than in the page so that a large
 * roster does not have to cross the wire to be narrowed.
 */
export async function listResidents(query: ResidentQuery = {}): Promise<ResidentRecord[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from('residents').select(COLUMNS);

  if (query.homeId) q = q.eq('home_id', query.homeId);
  if (query.grouping) q = q.eq('grouping', query.grouping);

  const status = query.status ?? 'active';
  if (status === 'active') q = q.eq('active', true);
  if (status === 'inactive') q = q.eq('active', false);

  if (query.search?.trim()) {
    // Escape PostgREST's or() delimiters. A name with a comma or a parenthesis
    // would otherwise be parsed as more filter terms and either error or,
    // worse, silently widen the filter.
    const term = query.search.trim().replace(/[,()\\]/g, ' ');
    q = q.or(
      [
        `first_name.ilike.%${term}%`,
        `last_name.ilike.%${term}%`,
        `preferred_name.ilike.%${term}%`,
        `room.ilike.%${term}%`
      ].join(',')
    );
  }

  switch (query.sort) {
    case 'first_name':
      q = q.order('first_name').order('last_name');
      break;
    case 'room':
      // Rooms are text ("2", "2B", "Upstairs"), so this is a lexical sort.
      // nullsFirst: false keeps unassigned residents at the bottom.
      q = q.order('room', { nullsFirst: false }).order('last_name');
      break;
    case 'recent':
      q = q.order('created_at', { ascending: false });
      break;
    default:
      q = q.order('last_name').order('first_name');
  }

  const { data, error } = await q;
  if (error) throw error;
  // The column list is a runtime constant, so the client cannot infer a row
  // type for it and falls back to an error-shaped union. The shape is checked
  // by toRecord instead.
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toRecord);
}

export async function getResident(id: string): Promise<ResidentRecord | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('residents').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toRecord(data as unknown as Record<string, unknown>) : null;
}

/** Distinct grouping values, for the filter dropdown. */
export async function listGroupings(homeId?: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from('residents').select('grouping').not('grouping', 'is', null);
  if (homeId) q = q.eq('home_id', homeId);

  const { data, error } = await q;
  if (error) throw error;

  const seen = new Set<string>();
  for (const row of data ?? []) {
    const g = (row as { grouping: string | null }).grouping;
    if (g) seen.add(g);
  }
  return [...seen].sort();
}

export type ResidentInput = {
  homeId: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  room?: string | null;
  grouping?: string | null;
  dob?: string | null;
  pronouns: { subject: string; object: string; possessive: string };
  /** Plaintext. Encrypted server-side before it lands in a column. */
  medicaidId?: string | null;
};

/**
 * Create a resident.
 *
 * The row is inserted through the caller's client so RLS decides whether they
 * may write to that home — a DSP hitting this API is rejected by the database,
 * not just by a UI check. The Medicaid ID is then encrypted in a second step
 * via service_role, since `write_medicaid_id` is not granted to `authenticated`.
 */
export async function createResident(
  input: ResidentInput,
  orgId: string
): Promise<{ id: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('residents')
    .insert({
      org_id: orgId,
      home_id: input.homeId,
      first_name: input.firstName,
      last_name: input.lastName,
      preferred_name: input.preferredName || null,
      room: input.room || null,
      grouping: input.grouping || null,
      dob: input.dob || null,
      pronoun_subject: input.pronouns.subject,
      pronoun_object: input.pronouns.object,
      pronoun_possessive: input.pronouns.possessive,
      is_demo: false,
      active: true
    })
    .select('id')
    .single();

  if (error) {
    // RLS rejection surfaces as a policy violation; say what to do about it.
    if (error.code === '42501') {
      return { error: 'Only a supervisor or administrator can add residents.' };
    }
    return { error: error.message };
  }

  if (input.medicaidId?.trim()) {
    const written = await writeMedicaidId(data.id, input.medicaidId.trim());
    if (written) return { error: written };
  }

  return { id: data.id };
}

export async function updateResident(
  id: string,
  input: Partial<ResidentInput> & { active?: boolean; dischargedOn?: string | null }
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const patch: Record<string, unknown> = {};
  if (input.firstName !== undefined) patch.first_name = input.firstName;
  if (input.lastName !== undefined) patch.last_name = input.lastName;
  if (input.preferredName !== undefined) patch.preferred_name = input.preferredName || null;
  if (input.room !== undefined) patch.room = input.room || null;
  if (input.grouping !== undefined) patch.grouping = input.grouping || null;
  if (input.dob !== undefined) patch.dob = input.dob || null;
  if (input.homeId !== undefined) patch.home_id = input.homeId;
  if (input.active !== undefined) patch.active = input.active;
  if (input.dischargedOn !== undefined) patch.discharged_on = input.dischargedOn || null;
  if (input.pronouns) {
    patch.pronoun_subject = input.pronouns.subject;
    patch.pronoun_object = input.pronouns.object;
    patch.pronoun_possessive = input.pronouns.possessive;
  }
  patch.updated_at = new Date().toISOString();

  const { error } = await supabase.from('residents').update(patch).eq('id', id);
  if (error) {
    if (error.code === '42501') {
      return { error: 'Only a supervisor or administrator can edit residents.' };
    }
    return { error: error.message };
  }

  if (input.medicaidId !== undefined && input.medicaidId?.trim()) {
    const written = await writeMedicaidId(id, input.medicaidId.trim());
    if (written) return { error: written };
  }

  return { ok: true };
}

/** Returns an error string, or null on success. */
async function writeMedicaidId(residentId: string, plain: string): Promise<string | null> {
  const phiKey = process.env.PHI_ENCRYPTION_KEY;
  if (!phiKey) {
    return 'The resident was saved, but the Medicaid ID could not be encrypted: PHI_ENCRYPTION_KEY is not set.';
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc('write_medicaid_id', {
    p_resident_id: residentId,
    p_plain: plain,
    p_key: phiKey
  });

  return error ? `The resident was saved, but the Medicaid ID failed to store: ${error.message}` : null;
}

/** Does this home already have someone by this name? Used by the importer. */
export async function findPossibleDuplicate(
  homeId: string,
  firstName: string,
  lastName: string
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('find_possible_duplicate', {
    p_home_id: homeId,
    p_first_name: firstName,
    p_last_name: lastName
  });
  if (error) return null;
  return (data as string | null) ?? null;
}
