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
  pronouns: Pronouns;
  isDemo: boolean;
  /** Present only when the server has decrypted it for the active note. */
  medicaidId?: string | null;
};

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
  isDemo: boolean;
  shiftId: string;
  shiftLabel: string;
  shiftSort: number;
  noteId: string | null;
  noteStatus: NoteStatus | null;
  noteUpdatedAt: string | null;
};
