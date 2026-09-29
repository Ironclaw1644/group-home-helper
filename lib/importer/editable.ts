/**
 * The form an admin reviews, edits and confirms — and the one rule set that
 * turns it into a template row.
 *
 * Pure and client-safe: the review screen renders its preview from
 * `renderConfigFor` / `schemaFor`, and the confirm route builds the stored row
 * from the same two functions after `normalizeEditable` has re-checked
 * everything the browser sent. So the preview cannot show a layout the saved
 * template would not print.
 *
 * What an edit can never do, whatever the request says:
 *   - name a value source outside PRINT_SOURCES (the renderer's closed set);
 *   - print one source twice;
 *   - carry a form number the server did not itself read off the page and
 *     find in the verified registry (see form-number-proof.ts);
 *   - drop the recorded-shift sections. Those come from the agency's standard
 *     template, because they are what the note is drafted and grounded from —
 *     an imported form changes the questions and the page, not the evidence.
 */
import {
  PRINT_SOURCES,
  type FormTemplateSchema,
  type PrintField,
  type PrintRow,
  type PrintSource,
  type RenderConfig
} from '../types';
import type { DraftTemplate } from './template-draft';

export type EditableField = {
  label: string;
  /** Null prints an empty ruled line, exactly like the paper form. */
  source: PrintSource | null;
  /** identity prints above the title; meta between the title and the questions. */
  section: 'identity' | 'meta';
};

export type EditableForm = {
  title: string;
  subtitle: string | null;
  prompts: string[];
  fields: EditableField[];
  signatureLabel: string;
  /** The sentence a DSP ticks before signing. Starts as the agency's current one. */
  attestation: string;
  /** Only ever set by the server, and only with a proof it can verify. */
  formNumber: string | null;
  formNumberProof: string | null;
  isLogOrTable: boolean;
  sourcePages: number[];
  /** What was printed and why the draft does not claim it, for the reviewer. */
  rejectedFormNumbers: { printed: string; why: string }[];
};

export const LIMITS = {
  title: 160,
  prompts: 12,
  prompt: 500,
  fields: 18,
  label: 90,
  attestation: 600
} as const;

/** What each value source means, in the words an agency admin uses. */
export const SOURCE_LABELS: Record<PrintSource, string> = {
  resident_legal_name: "Person's legal name",
  resident_preferred_name: "Person's preferred name",
  medicaid_id: 'Medicaid ID',
  service_date: 'Date of service',
  shift_label: 'Shift',
  shift_start: 'Shift start time',
  shift_stop: 'Shift end time',
  org_line: 'Your agency name',
  provider_id: 'Your Medicaid provider ID',
  place_of_service: 'House / place of service',
  service_type: 'Type of service',
  group_size: 'Number of people served',
  signature_name: 'Staff name',
  signature_title: 'Staff title'
};

const SOURCE_SET = new Set<string>(PRINT_SOURCES);

const clean = (s: unknown, max: number): string =>
  typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const stripColon = (label: string) => label.replace(/\s*:\s*$/, '').trim();

/** The model's draft, in the shape the review screen edits. */
export function toEditable(draft: DraftTemplate, attestation: string): EditableForm {
  const rows = (rs: PrintRow[] | undefined, section: EditableField['section']) =>
    (rs ?? []).flatMap((r) =>
      r.fields.map((f) => ({ label: stripColon(f.label), source: f.source ?? null, section }))
    );
  return {
    title: draft.name,
    subtitle: draft.import_review.subtitle,
    prompts: draft.schema.prompts,
    fields: [
      ...rows(draft.render_config.identity_rows, 'identity'),
      ...rows(draft.render_config.meta_rows, 'meta')
    ],
    signatureLabel: stripColon(draft.render_config.signature_block?.label ?? 'Staff Signature'),
    attestation,
    formNumber: draft.form_number,
    formNumberProof: null,
    isLogOrTable: draft.import_review.is_log_or_table,
    sourcePages: draft.import_review.source_pages,
    rejectedFormNumbers: draft.import_review.rejected_form_numbers
  };
}

export type Normalized = { ok: true; form: EditableForm } | { ok: false; errors: string[] };

/**
 * Re-check everything a browser sent. Trims, caps, drops empties, and turns a
 * repeated or unknown source into an empty ruled line rather than failing.
 * Only a form with no title, no questions or no attestation is refused —
 * those are the three things a note cannot be written or signed without.
 */
export function normalizeEditable(input: unknown): Normalized {
  const raw = (input ?? {}) as Partial<Record<keyof EditableForm, unknown>>;
  const errors: string[] = [];

  const title = clean(raw.title, LIMITS.title);
  if (!title) errors.push('The form needs a title.');

  const prompts = (Array.isArray(raw.prompts) ? raw.prompts : [])
    .map((p) => clean(p, LIMITS.prompt))
    .filter(Boolean)
    .slice(0, LIMITS.prompts);
  if (prompts.length === 0) errors.push('Keep at least one question for staff to answer.');

  const attestation = clean(raw.attestation, LIMITS.attestation);
  if (!attestation) errors.push('Staff need a sentence to confirm before they sign.');

  const used = new Set<string>();
  const fields: EditableField[] = [];
  for (const f of (Array.isArray(raw.fields) ? raw.fields : []).slice(0, LIMITS.fields)) {
    const field = (f ?? {}) as Record<string, unknown>;
    const label = stripColon(clean(field.label, LIMITS.label));
    if (!label) continue;
    let source: PrintSource | null =
      typeof field.source === 'string' && SOURCE_SET.has(field.source) ? (field.source as PrintSource) : null;
    if (source && used.has(source)) source = null;
    if (source) used.add(source);
    fields.push({ label, source, section: field.section === 'identity' ? 'identity' : 'meta' });
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    form: {
      title,
      subtitle: clean(raw.subtitle, 300) || null,
      prompts,
      fields,
      signatureLabel: stripColon(clean(raw.signatureLabel, LIMITS.label)) || 'Staff Signature',
      attestation,
      formNumber: typeof raw.formNumber === 'string' ? clean(raw.formNumber, 40) || null : null,
      formNumberProof: typeof raw.formNumberProof === 'string' ? raw.formNumberProof : null,
      isLogOrTable: raw.isLogOrTable === true,
      sourcePages: (Array.isArray(raw.sourcePages) ? raw.sourcePages : [])
        .filter((n): n is number => Number.isInteger(n) && n > 0 && n < 100)
        .slice(0, 20),
      rejectedFormNumbers: []
    }
  };
}

function toPrintField(f: EditableField, width: number): PrintField {
  return {
    ...(f.source ? { source: f.source } : {}),
    label: /[?]$/.test(f.label) ? `${f.label} ` : `${f.label}: `,
    width,
    grow: true
  };
}

function rowsOf(fields: EditableField[], perRow: number, width: number): PrintRow[] {
  const rows: PrintRow[] = [];
  for (let i = 0; i < fields.length; i += perRow) {
    rows.push({ fields: fields.slice(i, i + perRow).map((f) => toPrintField(f, width)) });
  }
  return rows;
}

/**
 * The printed layout. Page furniture that belongs to a jurisdiction's
 * document — its footer line and legal citation — is deliberately NOT carried
 * over from the base: this is the agency's own form, and the footer falls back
 * to the form's own title rather than naming a document it is not.
 */
export function renderConfigFor(form: EditableForm, base: RenderConfig): RenderConfig {
  const identity = form.fields.filter((f) => f.section === 'identity');
  const meta = form.fields.filter((f) => f.section === 'meta');
  const label = `${form.signatureLabel}: `;
  return {
    page: { size: base.page?.size ?? 'LETTER', margin: base.page?.margin ?? 42 },
    header: { title: form.title },
    identity_rows: rowsOf(identity, 2, 160),
    meta_rows: rowsOf(meta, 3, 100),
    signature_block: {
      label,
      // Long printed labels ("Provider/Staff Signature") wrap into a narrow
      // column without an explicit width; see RenderConfig.signature_block.
      ...(label.length > 18 ? { label_width: Math.min(220, Math.round(label.length * 6.2)) } : {})
    },
    narrative_min_height: base.narrative_min_height ?? 300,
    ...(base.service_type ? { service_type: base.service_type } : {}),
    ...(base.outcome_page ? { outcome_page: base.outcome_page } : {}),
    ...(base.addenda_page ? { addenda_page: base.addenda_page } : {}),
    ...(base.support_level_labels ? { support_level_labels: base.support_level_labels } : {}),
    ...(base.progress_labels ? { progress_labels: base.progress_labels } : {})
  };
}

/** The questions are the form's; the recorded-shift sections are the agency's standard ones. */
export function schemaFor(form: EditableForm, base: FormTemplateSchema): FormTemplateSchema {
  return {
    ...base,
    prompts: form.prompts,
    signature: { ...base.signature, attestation: form.attestation }
  };
}

/** A fixed sample so the preview reads like a finished note without inventing anyone real. */
export const SAMPLE_NARRATIVE =
  'Sam was observed in good spirits after waking and completed the morning routine with verbal prompts from staff. Staff prompted Sam to choose an activity, and Sam chose to help prepare lunch, washing vegetables with hand-over-hand support. In the afternoon Sam was transported to the park where Sam enjoyed a short walk with staff. There were no problems or concerns during shift.';
