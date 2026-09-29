import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getOrgJurisdiction, getTemplateForOrg, pickTemplate } from '@/lib/notes/repo';
import {
  GENERIC_JURISDICTION,
  type FormTemplate,
  type FormTemplateSchema,
  type RenderConfig
} from '@/lib/types';
import { renderConfigFor, schemaFor, type EditableForm } from './editable';
import { verifyFormNumber } from './form-number-proof';

/**
 * An agency's own form, stored as an org-owned row in ghh.form_templates.
 *
 * No new table: migration 0041's per-org rows (org_id not null) already win
 * over every global template in pickTemplate, and the jurisdiction pickers
 * read global rows only, so one agency's form is never offered to another.
 *
 * One key per org, versioned. Confirming a new form retires the previous
 * version instead of deleting it: signed notes keep pointing at the version
 * they were signed under (getTemplateById reads retired rows for exactly this).
 */
export const ORG_FORM_KEY = 'org_form';

/** The standard template this agency would use without its own form. */
export async function getStandardTemplateForOrg(orgId: string): Promise<FormTemplate> {
  const supabase = await createSupabaseServerClient();
  const jurisdiction = await getOrgJurisdiction(orgId);
  const { data, error } = await supabase
    .from('form_templates')
    .select('id, org_id, key, version, name, form_number, jurisdiction, schema, render_config')
    .is('org_id', null)
    .eq('active', true)
    .in('jurisdiction', [jurisdiction, GENERIC_JURISDICTION]);
  if (error) throw error;

  const picked = pickTemplate(
    (data ?? []).map((r) => ({
      id: r.id as string,
      orgId: null,
      key: r.key as string,
      version: r.version as number,
      name: r.name as string,
      formNumber: (r.form_number as string | null) ?? null,
      jurisdiction: r.jurisdiction as string,
      schema: r.schema as FormTemplateSchema,
      renderConfig: (r.render_config ?? {}) as RenderConfig
    })),
    orgId,
    jurisdiction
  );
  if (!picked) throw new Error(`No standard template for ${jurisdiction}.`);
  const { orgId: _global, ...template } = picked;
  return template;
}

export type OrgFormStatus = {
  current: FormTemplate;
  /** True when staff are writing on a form this agency uploaded. */
  isOwnForm: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
};

export async function getOrgFormStatus(orgId: string): Promise<OrgFormStatus> {
  const current = await getTemplateForOrg(orgId);
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('form_templates')
    .select('id, render_config')
    .eq('org_id', orgId)
    .eq('id', current.id)
    .maybeSingle();
  const source = ((data?.render_config ?? {}) as { import_source?: { confirmed_at?: string; confirmed_by?: string } })
    .import_source;
  return {
    current,
    isOwnForm: Boolean(data),
    confirmedAt: source?.confirmed_at ?? null,
    confirmedBy: source?.confirmed_by ?? null
  };
}

async function retireOrgForms(orgId: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from('form_templates')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('active', true);
  if (error) throw error;
}

async function nextVersion(orgId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('form_templates')
    .select('version')
    .eq('org_id', orgId)
    .eq('key', ORG_FORM_KEY)
    .order('version', { ascending: false })
    .limit(1);
  if (error) throw error;
  return ((data?.[0]?.version as number | undefined) ?? 0) + 1;
}

/**
 * Store a form a human has reviewed and confirmed. Service role, because RLS
 * gives no one INSERT on form_templates; the caller has already checked the
 * session is a supervisor or admin of `orgId`.
 */
export async function saveConfirmedForm(input: {
  orgId: string;
  form: EditableForm;
  confirmedBy: { id: string; name: string };
  model: string | null;
}): Promise<{ id: string; version: number }> {
  const base = await getStandardTemplateForOrg(input.orgId);

  // Only a number the import route itself resolved and signed survives.
  const formNumber = verifyFormNumber(input.orgId, input.form.formNumber, input.form.formNumberProof)
    ? input.form.formNumber
    : null;

  const renderConfig = {
    ...renderConfigFor(input.form, base.renderConfig),
    // Provenance, kept with the row it describes. Not read by the renderer.
    import_source: {
      kind: 'uploaded_blank_form',
      confirmed_by: input.confirmedBy.name,
      confirmed_by_id: input.confirmedBy.id,
      confirmed_at: new Date().toISOString(),
      model: input.model,
      source_pages: input.form.sourcePages,
      based_on_template: base.id
    }
  };

  const version = await nextVersion(input.orgId);
  const admin = createSupabaseAdminClient();

  // Retire first, then insert: if the insert fails the agency falls back to
  // the standard form, which is a working state. The reverse order could
  // leave two active org forms for a moment.
  await retireOrgForms(input.orgId);
  const { data, error } = await admin
    .from('form_templates')
    .insert({
      org_id: input.orgId,
      key: ORG_FORM_KEY,
      version,
      name: input.form.title,
      form_number: formNumber,
      jurisdiction: GENERIC_JURISDICTION,
      jurisdiction_name: null,
      schema: schemaFor(input.form, base.schema),
      render_config: renderConfig,
      active: true
    })
    .select('id, version')
    .single();
  if (error) throw error;
  return { id: data.id as string, version: data.version as number };
}

/** Go back to the standard form. Old versions stay stored for signed notes. */
export async function useStandardForm(orgId: string): Promise<void> {
  await retireOrgForms(orgId);
}
