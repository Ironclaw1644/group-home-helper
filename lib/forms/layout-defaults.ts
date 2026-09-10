import type { FormTemplate, PrintField, PrintRow } from '@/lib/types';

/**
 * What a template prints when it says nothing.
 *
 * These are the original Virginia layout. That template row carries none of the
 * layout keys below, so these constants are what it prints — which is exactly
 * why they are written as the fallback rather than as an "example" template.
 * Changing one changes a signed Medicaid record's appearance;
 * verify:jurisdictions fails if any of them drift.
 *
 * The footer line is deliberately not among them. It used to default to
 * "Daily Progress Notes Form #680", a form number for a document that does not
 * exist; `0040` retracted it and a template that declares no footer now prints
 * none. Do not reintroduce a default here — see docs/adding-a-state.md.
 *
 * They live here rather than inside `lib/pdf/TemplatePdf.tsx` because the
 * on-screen form preview needs the same answers, and that preview is a client
 * component — importing the renderer would pull @react-pdf/renderer into every
 * customer's browser bundle. This module is data and types only: no React, no
 * `server-only`, nothing that cannot cross that line.
 *
 * One source of truth. A default that existed in two places would drift, and
 * the direction it drifts is a preview that promises a caption the printed
 * document does not carry.
 */

export const DEFAULT_IDENTITY_ROWS: PrintRow[] = [
  {
    fields: [
      { source: 'resident_legal_name', label: "Individual's Name: ", width: 190, grow: true },
      { source: 'medicaid_id', label: 'Medicaid: ', width: 120 }
    ]
  }
];

export const DEFAULT_META_ROWS: PrintRow[] = [
  {
    fields: [
      { source: 'service_date', label: 'Date: ', width: 110 },
      { source: 'shift_label', label: 'Shift/Time: ', width: 110 }
    ]
  }
];

export const DEFAULT_SIGNATURE_LABEL = 'Staff Signature: ';

export const DEFAULT_SIGNATURE_FOOTER_FIELDS: PrintField[] = [
  { source: 'signature_title', label: 'Title: ', width: 90 },
  { source: 'service_date', label: 'Date: ', width: 90 }
];

export const DEFAULT_OUTCOME_HEADING = 'Service Plan Documentation — {resident}, {date}, {shift}';
export const DEFAULT_ADDENDA_HEADING = 'Addenda — {resident}, {date}, {shift}';

export const DEFAULT_STATUS_LABELS = {
  addressed: 'Addressed this shift',
  not_addressed: 'Not addressed this shift',
  unanswered: 'Not recorded — no answer documented'
} as const;

export const DEFAULT_ACTIVITY_LABELS = {
  yes: 'Yes',
  no: 'No',
  unanswered: 'Not recorded'
} as const;

/**
 * The labels on the identity blanks, for showing a preview of a form.
 *
 * Takes the first identity row, because that is the row a preview has space
 * for. A template that declares no identity rows prints the default ones above,
 * so that is what this returns for it too.
 */
export function identityLabels(rows: PrintRow[] | undefined): string[] {
  return (rows ?? DEFAULT_IDENTITY_ROWS)[0].fields.map((f) => f.label.trim());
}

/**
 * The same labels, for a caller that has only the raw strings.
 *
 * `ghh.available_jurisdictions()` returns the labels a template declared, or
 * null for one that declares none — because a template that declares none
 * prints the defaults above, and the fallback belongs here rather than repeated
 * in SQL.
 */
export const DEFAULT_IDENTITY_LABELS: string[] = identityLabels(undefined);

/**
 * The two captions a template prints, resolved the same way the renderer
 * resolves them.
 *
 * `ghh.available_jurisdictions()` computes the same two values in SQL, for the
 * sign-up picker, where no template has been resolved yet. Both mirror
 * `lib/pdf/TemplatePdf.tsx`; verify:jurisdictions asserts all three agree.
 */
export function formCaptions(
  template: Pick<FormTemplate, 'name' | 'formNumber' | 'renderConfig'>
): { title: string; formLine: string; identityLabels: string[]; legalCitation: string | null } {
  return {
    title: template.renderConfig.header?.title ?? template.name,
    formLine:
      template.renderConfig.footer?.form_line ??
      (template.formNumber === null
        ? template.name
        : `Daily Progress Notes Form #${template.formNumber}`),
    identityLabels: identityLabels(template.renderConfig.identity_rows),
    // No fallback. The other two captions degrade to a default; this one must
    // render as absent when absent, because the states with no citation are
    // precisely the ones where inventing one would do harm.
    legalCitation: template.renderConfig.footer?.legal_citation ?? null
  };
}
