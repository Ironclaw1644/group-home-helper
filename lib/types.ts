/**
 * Domain types.
 *
 * The form-template types mirror the `schema` jsonb seeded in
 * supabase/migrations/0004_seed_680.sql. If you add a field type there, add it
 * to `FormField` here and handle it in both components/form/FieldRenderer.tsx
 * and lib/pdf/TemplatePdf.tsx.
 */

export type StaffRole = 'dsp' | 'supervisor' | 'admin';
export type NoteStatus = 'draft' | 'signed';
export type AiMode = 'draft_assist' | 'example';

export type Pronouns = {
  subject: string; // he / she / they
  object: string; // him / her / them
  possessive: string; // his / her / their
};

export type Profile = {
  id: string;
  orgId: string;
  fullName: string;
  title: string;
  role: StaffRole;
  active: boolean;
};

export type Home = {
  id: string;
  orgId: string;
  name: string;
};

export type Shift = {
  id: string;
  label: string;
  sortOrder: number;
  crossesMidnight: boolean;
};

export type Resident = {
  id: string;
  orgId: string;
  homeId: string;
  firstName: string;
  lastName: string;
  /** What staff call them day to day. Falls back to firstName when null. */
  preferredName?: string | null;
  pronouns: Pronouns;
  isDemo: boolean;
  /** Present only when the server has decrypted it for the active note. */
  medicaidId?: string | null;
};

/**
 * A resident as the roster-management screens see them.
 *
 * Distinct from `Resident`, which is the slice the note flow needs. This one
 * carries the organizing fields and never carries a real Medicaid ID — that
 * stays encrypted and is decrypted only for the note being worked on.
 */
export type ResidentRecord = {
  id: string;
  orgId: string;
  homeId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  room: string | null;
  grouping: string | null;
  dob: string | null;
  pronouns: Pronouns;
  isDemo: boolean;
  active: boolean;
  dischargedOn: string | null;
  /** Fictional ID, demo residents only. */
  demoMedicaidId: string | null;
  createdAt: string;
};

export type ResidentSort = 'last_name' | 'first_name' | 'room' | 'recent';

// ---------------------------------------------------------------------------
// ISP outcomes
// ---------------------------------------------------------------------------

/**
 * One outcome from a resident's Individual Service Plan.
 *
 * This is what makes each resident's note page different: the form is the
 * shared Form #680 sections plus this person's own outcomes. A Medicaid
 * reviewer asks whether the day's documentation shows progress toward the plan,
 * so the note has to be built from the plan rather than from a fixed checklist.
 */
export type Outcome = {
  id: string;
  residentId: string;
  title: string;
  /** Verbatim from the ISP, so a reviewer finds the same words in both. */
  statement: string | null;
  supportStrategies: string | null;
  measure: string | null;
  frequency: string | null;
  category: string | null;
  sortOrder: number;
  active: boolean;
  startedOn: string | null;
  endedOn: string | null;
};

export const SUPPORT_LEVELS = [
  { value: 'independent', label: 'Independently' },
  { value: 'verbal_prompt', label: 'With verbal prompts' },
  { value: 'gestural_prompt', label: 'With gestural prompts' },
  { value: 'hands_on', label: 'With hands-on help' },
  { value: 'full_support', label: 'With full support' }
] as const;

export const PROGRESS_LEVELS = [
  { value: 'progressed', label: 'Made progress' },
  { value: 'maintained', label: 'Maintained' },
  { value: 'regressed', label: 'Lost ground' },
  { value: 'declined', label: 'Declined to take part' }
] as const;

export type SupportLevel = (typeof SUPPORT_LEVELS)[number]['value'];
export type ProgressLevel = (typeof PROGRESS_LEVELS)[number]['value'];

/** What a DSP recorded against one outcome on one shift. */
export type NoteOutcome = {
  outcomeId: string;
  addressed: boolean;
  supportLevel: SupportLevel | null;
  progress: ProgressLevel | null;
  comment: string | null;
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const DOCUMENT_KINDS = [
  { value: 'isp', label: 'Service plan (ISP)' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'behavioral', label: 'Behaviour support plan' },
  { value: 'medical', label: 'Medical' },
  { value: 'consent', label: 'Consent' },
  { value: 'legal', label: 'Legal / guardianship' },
  { value: 'other', label: 'Other' }
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]['value'];

export type ResidentDocument = {
  id: string;
  orgId: string;
  /** Null for agency-level documents. */
  residentId: string | null;
  title: string;
  kind: DocumentKind;
  description: string | null;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  effectiveOn: string | null;
  expiresOn: string | null;
  uploadedBy: string | null;
  createdAt: string;
};

/** The name to use in narrative and on screen. */
export function displayName(r: {
  firstName: string;
  preferredName?: string | null;
}): string {
  return r.preferredName?.trim() || r.firstName;
}

// ---------------------------------------------------------------------------
// Form template
// ---------------------------------------------------------------------------

export type ChipOption = {
  value: string;
  label: string;
  /** Marks the shift as one with a concern, which suppresses the
   *  "no problems or concerns" closing line. */
  flags_concern?: boolean;
};

type FieldBase = {
  key: string;
  label: string;
  help?: string;
  /** Which of the five printed prompt questions this field answers. */
  prompt_ref?: number;
  visible_when?: { field: string; equals: unknown };
  required_when?: { field: string; equals: unknown };
};

export type ChipsField = FieldBase & {
  type: 'chips';
  multiple: boolean;
  options: ChipOption[];
  allow_other?: boolean;
};

export type BooleanField = FieldBase & {
  type: 'boolean';
  flags_concern_when_true?: boolean;
};

export type TextField = FieldBase & {
  type: 'text';
  multiline?: boolean;
  placeholder?: string;
};

export type FormField = ChipsField | BooleanField | TextField;

export type FormSection = {
  key: string;
  title: string;
  prompt_refs?: number[];
  fields: FormField[];
  /**
   * Words that only make sense if something in this section was recorded.
   *
   * When the DSP selected nothing here, none of these may appear in the
   * narrative. This catches whole-topic fabrication that a per-option check
   * misses — a model that invents "a nutritious meal was provided" when no
   * meal field was touched, for instance, since "meal" is not itself an
   * option label.
   */
  grounding_vocabulary?: string[];
};

export type FormTemplateSchema = {
  /** The five questions printed on the paper form, with {name} placeholders. */
  prompts: string[];
  sections: FormSection[];
  narrative: { key: string; type: 'narrative'; label: string; min_length?: number };
  signature: { key: string; type: 'signature'; attestation: string };
};

export type RenderConfig = {
  page?: { size?: string; margin?: number };
  header?: { logo?: string; org_line?: string; title?: string };
  footer?: { form_line?: string };
  narrative_min_height?: number;
};

export type FormTemplate = {
  id: string;
  key: string;
  version: number;
  name: string;
  formNumber: string | null;
  schema: FormTemplateSchema;
  renderConfig: RenderConfig;
};

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/**
 * What the DSP actually tapped. Keys are `${sectionKey}.${fieldKey}`; values
 * are string arrays for chips, booleans, or free text. This object is the
 * grounding input for Draft Assist — the model may not describe anything that
 * is not represented here.
 */
export type StructuredData = Record<string, string[] | boolean | string | undefined>;

export type Note = {
  id: string;
  orgId: string;
  templateId: string;
  templateVersion: number;
  residentId: string;
  homeId: string;
  shiftId: string;
  serviceDate: string; // YYYY-MM-DD
  authorId: string;
  status: NoteStatus;
  structuredData: StructuredData;
  narrative: string;
  aiAssisted: boolean;
  aiMode: AiMode | null;
  isTrainingExample: boolean;
  signedAt: string | null;
  signatureName: string | null;
  signatureTitle: string | null;
  signatureImagePath: string | null;
  attestationText: string | null;
  locked: boolean;
  similarityPrev: number | null;
  updatedAt: string;
};

export type NoteAddendum = {
  id: string;
  noteId: string;
  body: string;
  signatureName: string;
  signatureTitle: string;
  createdAt: string;
};

export type RosterEntry = {
  residentId: string;
  residentFirstName: string;
  residentLastName: string;
  residentPreferredName: string | null;
  residentRoom: string | null;
  isDemo: boolean;
  shiftId: string;
  shiftLabel: string;
  shiftSort: number;
  noteId: string | null;
  noteStatus: NoteStatus | null;
  noteUpdatedAt: string | null;
};
