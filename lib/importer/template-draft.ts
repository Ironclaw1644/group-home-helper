/**
 * Path 1, the offline half: a model's reading of an uploaded blank form becomes
 * a DRAFT row in the shape of ghh.form_templates.
 *
 * SPIKE — spike/form-importer. Pure: no network, no database, no env. The model
 * call lives in model.ts; everything that decides what goes into a template
 * lives here, so it can be tested against recorded fixtures.
 *
 * What this module will not do, whatever the model says:
 *   - produce an active template. Every draft is active=false and needs a
 *     human to sign it off.
 *   - assign a form_number unless that number is printed on the uploaded form
 *     AND listed as verified in docs/golden/form-number-registry.json. A
 *     document code, a filename, or a regulation section is not a form number.
 *     ("Virginia Form #680" shipped for a year; it was a regulation section.)
 *   - map a field to a value source outside PRINT_SOURCES. An unknown label is
 *     kept as an empty ruled line, which is what the paper form is.
 *   - write an attestation or a footer citation. Those are claims, and a human
 *     makes claims.
 */
import { PRINT_SOURCES, type PrintField, type PrintRow, type PrintSource } from '../types';

// ---------------------------------------------------------------------------
// What the model returns (validated by zod in model.ts; typed here)
// ---------------------------------------------------------------------------

export type RawFieldSection = 'identity' | 'meta' | 'signature' | 'other';

export type RawField = {
  /** The label exactly as printed. */
  label: string;
  /** The model's guess at a value source. Checked against PRINT_SOURCES. */
  suggested_source: string | null;
  section: RawFieldSection;
};

export type RawForm = {
  title: string;
  subtitle: string | null;
  /** 1-based pages of the upload this form occupies. */
  pages: number[];
  /** Anything printed that looks like a form number or document code, verbatim. */
  printed_form_numbers: string[];
  /** Narrative prompts exactly as printed, one entry per printed block. */
  prompt_blocks_verbatim: string[];
  fields: RawField[];
  /** True when the form is a table/log (time sheet, mileage) rather than a narrative note. */
  is_log_or_table: boolean;
};

export type RawExtraction = { forms: RawForm[] };

// ---------------------------------------------------------------------------
// The draft row
// ---------------------------------------------------------------------------

export type FormNumberRegistry = {
  verified: { number: string; label?: string; jurisdiction?: string }[];
};

export type DraftTemplate = {
  org_id: string;
  key: string;
  version: 1;
  name: string;
  form_number: string | null;
  jurisdiction: 'GENERIC';
  active: false;
  schema: {
    prompts: string[];
    sections: [];
    narrative: { key: 'narrative'; type: 'narrative'; label: string };
    /** Empty on purpose: an attestation is a legal statement a human writes. */
    signature: { key: 'signature'; type: 'signature'; attestation: '' };
  };
  render_config: {
    header: { title: string };
    identity_rows: PrintRow[];
    meta_rows: PrintRow[];
    signature_block?: { label: string; label_width?: number };
  };
  /** Not a table column. Travels with the draft to the review screen. */
  import_review: {
    status: 'pending_human_signoff';
    source_pages: number[];
    subtitle: string | null;
    is_log_or_table: boolean;
    rejected_form_numbers: { printed: string; why: string }[];
    unmapped_labels: string[];
    prompt_blocks_verbatim: string[];
  };
};

const SOURCE_SET = new Set<string>(PRINT_SOURCES);

export const collapseWhitespace = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * A form often prints its questions as one run-on paragraph (West Virginia
 * does). Split at question marks, never rewording. A trailing fragment with no
 * question mark is kept as-is rather than dropped.
 */
export function splitPrompts(blocks: string[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    const text = collapseWhitespace(block);
    if (!text) continue;
    const parts = text.match(/[^?]+\?|[^?]+$/g) ?? [];
    for (const p of parts) {
      const t = p.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/**
 * A printed number becomes form_number only if the registry verifies it. Every
 * other candidate is returned with the reason it was refused, so the reviewer
 * sees what was on the page and why the draft does not claim it.
 */
export function resolveFormNumber(
  printed: string[],
  registry: FormNumberRegistry
): { formNumber: string | null; rejected: { printed: string; why: string }[] } {
  const rejected: { printed: string; why: string }[] = [];
  let formNumber: string | null = null;
  for (const raw of printed) {
    const candidate = collapseWhitespace(raw);
    if (!candidate) continue;
    const hit = registry.verified.find((v) => {
      const re = new RegExp(`(^|[^0-9A-Za-z])${v.number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^0-9A-Za-z])`);
      return re.test(candidate);
    });
    if (hit && formNumber === null) {
      formNumber = hit.number;
    } else if (hit) {
      rejected.push({ printed: candidate, why: 'a second verified number on one form; kept the first' });
    } else {
      rejected.push({
        printed: candidate,
        why: 'not in the verified form-number registry; a document code or filename is not a form number'
      });
    }
  }
  return { formNumber, rejected };
}

export function slugKey(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `imported_${slug || 'form'}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function toPrintField(field: RawField, used: Set<PrintSource>): { field: PrintField; mapped: boolean } {
  const label = collapseWhitespace(field.label);
  const printedLabel = /[:?]$/.test(label) ? `${label} ` : `${label}: `;
  const s = field.suggested_source;
  if (s && SOURCE_SET.has(s) && !used.has(s as PrintSource)) {
    used.add(s as PrintSource);
    return { field: { source: s as PrintSource, label: printedLabel, width: 120 }, mapped: true };
  }
  // Unknown or repeated source: an empty ruled line with the printed label.
  return { field: { label: printedLabel, width: 120 }, mapped: false };
}

export function buildDraftTemplate(
  form: RawForm,
  opts: { orgId: string; registry: FormNumberRegistry }
): DraftTemplate {
  const used = new Set<PrintSource>();
  const unmapped: string[] = [];
  const identity: PrintField[] = [];
  const meta: PrintField[] = [];
  let signatureLabel: string | null = null;

  for (const f of form.fields) {
    if (f.section === 'signature' && f.suggested_source !== 'signature_name') {
      signatureLabel ??= collapseWhitespace(f.label);
      continue;
    }
    const { field, mapped } = toPrintField(f, used);
    if (!mapped) unmapped.push(collapseWhitespace(f.label));
    (f.section === 'identity' ? identity : meta).push(field);
  }

  const { formNumber, rejected } = resolveFormNumber(form.printed_form_numbers, opts.registry);
  const title = collapseWhitespace(form.title);

  return {
    org_id: opts.orgId,
    key: slugKey(title),
    version: 1,
    name: title,
    form_number: formNumber,
    jurisdiction: 'GENERIC',
    active: false,
    schema: {
      prompts: splitPrompts(form.prompt_blocks_verbatim),
      sections: [],
      narrative: { key: 'narrative', type: 'narrative', label: 'Narrative' },
      signature: { key: 'signature', type: 'signature', attestation: '' }
    },
    render_config: {
      header: { title },
      identity_rows: chunk(identity, 2).map((fields) => ({ fields })),
      meta_rows: chunk(meta, 3).map((fields) => ({ fields })),
      ...(signatureLabel
        ? { signature_block: { label: signatureLabel.endsWith(':') ? `${signatureLabel} ` : `${signatureLabel}: ` } }
        : {})
    },
    import_review: {
      status: 'pending_human_signoff',
      source_pages: form.pages,
      subtitle: form.subtitle,
      is_log_or_table: form.is_log_or_table,
      rejected_form_numbers: rejected,
      unmapped_labels: unmapped,
      prompt_blocks_verbatim: form.prompt_blocks_verbatim
    }
  };
}

/** One upload may carry several forms; each becomes its own draft. */
export function buildDraftTemplates(
  raw: RawExtraction,
  opts: { orgId: string; registry: FormNumberRegistry }
): DraftTemplate[] {
  return raw.forms.map((f) => buildDraftTemplate(f, opts));
}

/** Every source a draft would print, the way verify:wv-form counts them. */
export function printedSources(draft: DraftTemplate): Set<string> {
  const out = new Set<string>();
  for (const row of [...draft.render_config.identity_rows, ...draft.render_config.meta_rows]) {
    for (const f of row.fields) if (f.source) out.add(f.source);
  }
  if (draft.render_config.signature_block) out.add('signature_name');
  return out;
}
