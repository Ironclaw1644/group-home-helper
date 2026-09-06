import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { decryptMedicaidId } from '@/lib/supabase/admin';
import type {
  FormTemplate,
  FormTemplateSchema,
  Note,
  NoteAddendum,
  RenderConfig,
  Resident,
  RosterEntry,
  Shift,
  StructuredData
} from '@/lib/types';
import { GENERIC_JURISDICTION } from '@/lib/types';

const TEMPLATE_COLUMNS = 'id, org_id, key, version, name, form_number, jurisdiction, schema, render_config';

/**
 * One candidate template row, before precedence is applied.
 *
 * Split out from the query so the precedence rule below is a pure function that
 * can be tested directly — and asserted to agree with `ghh.template_for_org()`,
 * which implements the same rule in SQL for anyone working in the database.
 */
export type TemplateCandidate = {
  orgId: string | null;
  jurisdiction: string;
  version: number;
};

/**
 * Which template an organization files under.
 *
 * Precedence, highest first:
 *
 *   1. a template owned by this org, in this org's jurisdiction
 *   2. a global template in this org's jurisdiction
 *   3. a global GENERIC template
 *
 * **There is no rule 4.** An org is never handed another state's form. A
 * Virginia provider printing Ohio's layout is worse than printing nothing,
 * because the result looks official, gets signed, and is filed with Medicaid.
 * When no template matches, callers get an error and no document.
 */
export function pickTemplate<T extends TemplateCandidate>(
  candidates: T[],
  orgId: string,
  jurisdiction: string
): T | null {
  const eligible = candidates.filter(
    (t) =>
      (t.orgId === null || t.orgId === orgId) &&
      (t.jurisdiction === jurisdiction || t.jurisdiction === GENERIC_JURISDICTION)
  );

  const rank = (t: T) =>
    (t.orgId !== null ? 4 : 0) + (t.jurisdiction === jurisdiction ? 2 : 0);

  return (
    [...eligible].sort((a, b) => rank(b) - rank(a) || b.version - a.version)[0] ?? null
  );
}

/** The jurisdiction an organization files under. */
export async function getOrgJurisdiction(orgId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('jurisdiction')
    .eq('id', orgId)
    .maybeSingle();

  if (error || !data?.jurisdiction) {
    // Not defaulted to a state. Guessing here is how an agency ends up filing
    // another jurisdiction's form, which is the exact failure this branch
    // exists to make impossible.
    throw new Error(`Organization ${orgId} has no jurisdiction set.`);
  }
  return data.jurisdiction as string;
}

/**
 * The active form template for an organization.
 *
 * Replaces the old `getActiveTemplate()`, which took no arguments and resolved
 * one hardcoded key — `daily_progress_note_680` — for every customer on the
 * install, so a customer outside Virginia printed Virginia's form.
 */
export async function getTemplateForOrg(orgId: string): Promise<FormTemplate> {
  const supabase = await createSupabaseServerClient();
  const jurisdiction = await getOrgJurisdiction(orgId);

  const { data, error } = await supabase
    .from('form_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('active', true)
    // Parameterised by the client. RLS already limits this to global rows and
    // the caller's own org; the filter is here so a service-role caller, which
    // bypasses RLS, gets the same answer.
    .in('jurisdiction', [jurisdiction, GENERIC_JURISDICTION]);

  if (error) throw error;

  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    orgId: (r.org_id as string | null) ?? null,
    key: r.key as string,
    version: r.version as number,
    name: r.name as string,
    formNumber: (r.form_number as string | null) ?? null,
    jurisdiction: r.jurisdiction as string,
    schema: r.schema as FormTemplateSchema,
    renderConfig: (r.render_config ?? {}) as RenderConfig
  }));

  const picked = pickTemplate(rows, orgId, jurisdiction);

  if (!picked) {
    throw new Error(
      `No form template is installed for jurisdiction "${jurisdiction}". ` +
        `Add one, or install the ${GENERIC_JURISDICTION} template — see docs/adding-a-state.md.`
    );
  }

  const { orgId: _ownedBy, ...template } = picked;
  return template;
}

/** Roster for one home on one date: every resident × every active shift. */
export async function getRoster(homeId: string, serviceDate: string): Promise<RosterEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('roster_for_date', {
    p_home_id: homeId,
    p_service_date: serviceDate
  });
  if (error) throw error;

  return (data ?? []).map((r: Record<string, unknown>) => ({
    residentId: r.resident_id as string,
    residentFirstName: r.resident_first_name as string,
    residentLastName: r.resident_last_name as string,
    residentPreferredName: (r.resident_preferred_name as string | null) ?? null,
    residentRoom: (r.resident_room as string | null) ?? null,
    isDemo: r.is_demo as boolean,
    shiftId: r.shift_id as string,
    shiftLabel: r.shift_label as string,
    shiftSort: r.shift_sort as number,
    noteId: (r.note_id as string) ?? null,
    noteStatus: (r.note_status as RosterEntry['noteStatus']) ?? null,
    noteUpdatedAt: (r.note_updated_at as string) ?? null
  }));
}

export async function getShifts(homeId: string): Promise<Shift[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('shifts')
    .select('id, label, sort_order, crosses_midnight, start_time, end_time')
    .eq('home_id', homeId)
    .eq('active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    label: s.label,
    sortOrder: s.sort_order,
    crossesMidnight: s.crosses_midnight,
    startTime: s.start_time ?? null,
    endTime: s.end_time ?? null
  }));
}

/**
 * Where the service was delivered.
 *
 * Ohio's rule asks for "place of service" by name (OAC 5123-9-30(E)(3)).
 * Returns null rather than a guess when the home cannot be read — a blank on
 * the form is honest, an invented address is not.
 */
export async function getHomeName(homeId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('homes').select('name').eq('id', homeId).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/**
 * How many people were documented as served at this site on this shift.
 *
 * Ohio asks for "group size in which the service was provided"
 * (OAC 5123-9-30(E)(9)) because the daily billing unit differs when residents
 * share a provider at one site (OAC 5123-9-31). It is counted from the notes
 * that exist for the same home, shift and service date — that is the set of
 * people someone actually documented, which is the only defensible answer.
 *
 * Returns null when the count cannot be taken, so the field prints blank rather
 * than asserting a number nobody measured.
 */
export async function countServedOnShift(
  homeId: string,
  shiftId: string,
  serviceDate: string
): Promise<number | null> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from('notes')
    .select('id', { count: 'exact', head: true })
    .eq('home_id', homeId)
    .eq('shift_id', shiftId)
    .eq('service_date', serviceDate);

  if (error || typeof count !== 'number') return null;
  return count;
}

// Columns are selected via a runtime string, so PostgREST cannot infer a row
// type here. Narrow once, in one place, rather than casting at every call site.
function mapNote(input: unknown): Note {
  const row = input as Record<string, unknown>;
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    templateId: row.template_id as string,
    templateVersion: row.template_version as number,
    residentId: row.resident_id as string,
    homeId: row.home_id as string,
    shiftId: row.shift_id as string,
    serviceDate: row.service_date as string,
    authorId: row.author_id as string,
    status: row.status as Note['status'],
    structuredData: (row.structured_data ?? {}) as StructuredData,
    narrative: (row.narrative ?? '') as string,
    aiAssisted: row.ai_assisted as boolean,
    aiMode: (row.ai_mode as Note['aiMode']) ?? null,
    isTrainingExample: row.is_training_example as boolean,
    signedAt: (row.signed_at as string) ?? null,
    signatureName: (row.signature_name as string) ?? null,
    signatureTitle: (row.signature_title as string) ?? null,
    signatureImagePath: (row.signature_image_path as string) ?? null,
    attestationText: (row.attestation_text as string) ?? null,
    locked: row.locked as boolean,
    similarityPrev: (row.similarity_prev as number) ?? null,
    updatedAt: row.updated_at as string,
    prestagedAt: (row.prestaged_at as string) ?? null,
    prestageConfirmedAt: (row.prestage_confirmed_at as string) ?? null
  };
}

const NOTE_COLUMNS =
  'id, org_id, template_id, template_version, resident_id, home_id, shift_id, service_date, ' +
  'author_id, status, structured_data, narrative, ai_assisted, ai_mode, is_training_example, ' +
  'signed_at, signature_name, signature_title, signature_image_path, attestation_text, ' +
  'locked, similarity_prev, updated_at, prestaged_at, prestage_confirmed_at';

export async function getNote(noteId: string): Promise<Note | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('notes').select(NOTE_COLUMNS).eq('id', noteId).maybeSingle();
  if (error) throw error;
  return data ? mapNote(data) : null;
}

/**
 * Fetch a resident. `includeMedicaidId` decrypts the ID, which is a PHI read —
 * only pass true when rendering the note the DSP is actively working on or its
 * PDF, and log it.
 */
export async function getResident(
  residentId: string,
  includeMedicaidId = false
): Promise<Resident | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('residents')
    .select(
      'id, org_id, home_id, first_name, last_name, preferred_name, pronoun_subject, pronoun_object, pronoun_possessive, is_demo'
    )
    .eq('id', residentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const resident: Resident = {
    id: data.id,
    orgId: data.org_id,
    homeId: data.home_id,
    firstName: data.first_name,
    lastName: data.last_name,
    preferredName: data.preferred_name ?? null,
    pronouns: {
      subject: data.pronoun_subject,
      object: data.pronoun_object,
      possessive: data.pronoun_possessive
    },
    isDemo: data.is_demo
  };

  if (includeMedicaidId) {
    // The RLS-scoped select above already proved the caller may see this
    // resident, so the service-role decrypt below is not an escalation.
    resident.medicaidId = await decryptMedicaidId(residentId);
  }

  return resident;
}

export async function getAddenda(noteId: string): Promise<NoteAddendum[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('note_addenda')
    .select('id, note_id, body, signature_name, signature_title, created_at')
    .eq('note_id', noteId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id,
    noteId: a.note_id,
    body: a.body,
    signatureName: a.signature_name,
    signatureTitle: a.signature_title,
    createdAt: a.created_at
  }));
}

/**
 * Find today's note for a resident+shift, creating an empty draft if none
 * exists. The unique constraint on (resident_id, shift_id, service_date) means
 * two staff opening the same slot at once cannot produce duplicate notes — the
 * loser of the race re-reads the winner's row.
 */
export async function getOrCreateNote(params: {
  orgId: string;
  homeId: string;
  residentId: string;
  shiftId: string;
  serviceDate: string;
  authorId: string;
}): Promise<Note> {
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from('notes')
    .select(NOTE_COLUMNS)
    .eq('resident_id', params.residentId)
    .eq('shift_id', params.shiftId)
    .eq('service_date', params.serviceDate)
    .maybeSingle();

  if (existing) return mapNote(existing);

  const template = await getTemplateForOrg(params.orgId);
  const isDemo = (await getResident(params.residentId))?.isDemo ?? false;

  const { data: created, error } = await supabase
    .from('notes')
    .insert({
      org_id: params.orgId,
      template_id: template.id,
      template_version: template.version,
      resident_id: params.residentId,
      home_id: params.homeId,
      shift_id: params.shiftId,
      service_date: params.serviceDate,
      author_id: params.authorId,
      status: 'draft',
      structured_data: {},
      narrative: '',
      is_training_example: isDemo
    })
    .select(NOTE_COLUMNS)
    .single();

  if (error) {
    // Lost the insert race — the other writer's row is authoritative.
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('notes')
        .select(NOTE_COLUMNS)
        .eq('resident_id', params.residentId)
        .eq('shift_id', params.shiftId)
        .eq('service_date', params.serviceDate)
        .single();
      if (raced) return mapNote(raced);
    }
    throw error;
  }

  return mapNote(created);
}

/** The resident's most recent signed note before `beforeDate`, for duplicate detection. */
export async function getPreviousSignedNarrative(
  residentId: string,
  beforeDate: string
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('notes')
    .select('narrative')
    .eq('resident_id', residentId)
    .eq('status', 'signed')
    .lt('service_date', beforeDate)
    .order('service_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.narrative ?? null;
}
