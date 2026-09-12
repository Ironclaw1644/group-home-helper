import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { LibraryActivity, MeasureType, OrgOutcomePreset } from '@/lib/types';

/**
 * Agency-authored outcome presets.
 *
 * The starter library is content this app ships, one set per jurisdiction. A
 * preset is the agency's own wording, saved out of an outcome they already
 * wrote, reusable for the next person. Same framing either way: a draft to
 * rewrite in that person's own words, not a plan to adopt.
 *
 * Reads go through the caller's client so RLS scopes them to the caller's
 * organization. Writes are supervisor-only, enforced by the policy and by the
 * route; the org_id is set explicitly here as well, because a with-check that
 * passes on a row the application populated wrongly is still a wrong row.
 *
 * The text stored here is de-personalized (lib/outcomes/depersonalize.ts). A
 * resident's name reaching this table would be PHI readable by everyone in the
 * agency, including staff with no access to that person's home.
 */

const PRESET_COLUMNS =
  'id, category, title, lens, important_to, important_for, statement, frequency, ' +
  'activities, created_at';

function toActivities(raw: unknown): LibraryActivity[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => {
    const row = (a ?? {}) as Record<string, unknown>;
    return {
      description: String(row.description ?? ''),
      measureType: (row.measureType as MeasureType) ?? 'routine',
      measure: String(row.measure ?? ''),
      supportInstructions: String(row.supportInstructions ?? ''),
      dailyQuestion: String(row.dailyQuestion ?? '')
    };
  });
}

function toPreset(r: Record<string, unknown>): OrgOutcomePreset {
  return {
    id: r.id as string,
    category: (r.category as string | null) ?? null,
    title: r.title as string,
    lens: (r.lens as OrgOutcomePreset['lens']) ?? null,
    importantTo: (r.important_to as string | null) ?? null,
    importantFor: (r.important_for as string | null) ?? null,
    statement: (r.statement as string | null) ?? null,
    frequency: (r.frequency as string | null) ?? null,
    activities: toActivities(r.activities),
    createdAt: r.created_at as string
  };
}

/**
 * Every live preset this agency has saved.
 *
 * Archived ones are excluded: a preset is retired when the agency stops
 * offering it, and an archived row stays readable so it is still possible to
 * see where an existing outcome's wording came from.
 */
export async function listPresets(): Promise<OrgOutcomePreset[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('org_outcome_presets')
    .select(PRESET_COLUMNS)
    .is('archived_at', null)
    .order('category', { nullsFirst: false })
    .order('title');

  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toPreset);
}

/** The chosen presets, for install. RLS keeps this to the caller's own org. */
export async function getPresets(ids: string[]): Promise<OrgOutcomePreset[]> {
  if (ids.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('org_outcome_presets')
    .select(PRESET_COLUMNS)
    .in('id', ids)
    .is('archived_at', null);

  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toPreset);
}

export type PresetInput = {
  title: string;
  category?: string | null;
  lens?: OrgOutcomePreset['lens'];
  importantTo?: string | null;
  importantFor?: string | null;
  statement?: string | null;
  frequency?: string | null;
  activities: LibraryActivity[];
};

export async function createPreset(
  input: PresetInput,
  orgId: string,
  createdBy: string
): Promise<{ id: string } | { error: string }> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('org_outcome_presets')
    .insert({
      org_id: orgId,
      created_by: createdBy,
      title: input.title.trim(),
      category: input.category?.trim() || null,
      lens: input.lens ?? null,
      important_to: input.importantTo?.trim() || null,
      important_for: input.importantFor?.trim() || null,
      statement: input.statement?.trim() || null,
      frequency: input.frequency?.trim() || null,
      activities: input.activities
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '42501') {
      return { error: 'Only a supervisor or administrator can save a preset.' };
    }
    return { error: error.message };
  }
  return { id: data.id };
}
