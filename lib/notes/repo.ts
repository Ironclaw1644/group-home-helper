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

const TEMPLATE_KEY = 'daily_progress_note_680';

/** The active Form #680 template (highest version). */
export async function getActiveTemplate(): Promise<FormTemplate> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('form_templates')
    .select('id, key, version, name, form_number, schema, render_config')
    .eq('key', TEMPLATE_KEY)
    .eq('active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Form template "${TEMPLATE_KEY}" is not installed. Run the seed migration.`);
  }

  return {
    id: data.id,
    key: data.key,
    version: data.version,
    name: data.name,
    formNumber: data.form_number,
    schema: data.schema as FormTemplateSchema,
    renderConfig: (data.render_config ?? {}) as RenderConfig
  };
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
    .select('id, label, sort_order, crosses_midnight')
    .eq('home_id', homeId)
    .eq('active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    label: s.label,
    sortOrder: s.sort_order,
    crossesMidnight: s.crosses_midnight
  }));
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
    updatedAt: row.updated_at as string
  };
}

const NOTE_COLUMNS =
  'id, org_id, template_id, template_version, resident_id, home_id, shift_id, service_date, ' +
  'author_id, status, structured_data, narrative, ai_assisted, ai_mode, is_training_example, ' +
  'signed_at, signature_name, signature_title, signature_image_path, attestation_text, ' +
  'locked, similarity_prev, updated_at';

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

  const template = await getActiveTemplate();
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
