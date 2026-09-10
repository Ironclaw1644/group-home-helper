/**
 * Domain types.
 *
 * The form-template types mirror the `schema` jsonb seeded in
 * supabase/migrations/0004_seed_680.sql. If you add a field type there, add it
 * to `FormField` here and handle it in both components/form/FieldRenderer.tsx
 * and lib/pdf/TemplatePdf.tsx.
 *
 * A form template is one jurisdiction's document expressed as data. See
 * docs/engine-jurisdiction-seam.md for what belongs here versus in code, and
 * docs/adding-a-state.md for how to author one.
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
  /** 'HH:MM:SS'. Ohio's rule asks for the times service started and stopped. */
  startTime?: string | null;
  endTime?: string | null;
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
 * shared note sections plus this person's own outcomes. A Medicaid
 * reviewer asks whether the day's documentation shows progress toward the plan,
 * so the note has to be built from the plan rather than from a fixed checklist.
 */
export type Outcome = {
  id: string;
  residentId: string;
  title: string;
  /** Virginia formula: the "so that / in order to" half. */
  importantTo?: string | null;
  /** A health or behavioural need the outcome also addresses. */
  importantFor?: string | null;
  targetDate?: string | null;
  lens?: 'independence' | 'integration' | 'quality_of_life' | null;
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

/**
 * How an activity's progress is measured, per Virginia DBHDS guidance.
 *
 * `health_safety` is the odd one: its measure states the condition under which
 * the support would be *removed* ("when the clinician discontinues the
 * protocol"), not a target to reach.
 */
export const MEASURE_TYPES = [
  { value: 'routine', label: 'Routine', hint: 'Activity plus how often' },
  { value: 'skill_building', label: 'Skill building', hint: 'Countable achievement, how often and how long' },
  { value: 'health_safety', label: 'Health & safety', hint: 'The condition for removing the support' }
] as const;

export type MeasureType = (typeof MEASURE_TYPES)[number]['value'];

/**
 * One support activity under an outcome — the WHAT in Virginia's
 * outcome / activity / instruction hierarchy.
 */
export type OutcomeActivity = {
  id: string;
  outcomeId: string;
  description: string;
  measureType: MeasureType;
  measure: string | null;
  supportInstructions: string | null;
  /** The yes/no a DSP answers each shift, in the plan's own words. */
  dailyQuestion: string | null;
  sortOrder: number;
  active: boolean;
};

/**
 * What a DSP answered for one activity on one shift.
 *
 * `completed: null` means unanswered, which is not the same as "no" — a blank
 * is a gap in the record, a no is a documented fact.
 */
export type NoteActivity = {
  activityId: string;
  completed: boolean | null;
  concern: boolean;
  comment: string | null;
};

/**
 * What a DSP recorded against one outcome on one shift.
 *
 * `addressed: null` means nobody has answered yet, and it is not the same as
 * `false`. "Not this shift" is a clinical claim — it asserts this person's
 * service plan was not worked on — and a fresh note must not make that claim on
 * the DSP's behalf. An unanswered outcome is never written to the database: the
 * absence of a `note_outcomes` row *is* the unanswered state, which is why this
 * type carries a null the column does not have to.
 */
export type NoteOutcome = {
  outcomeId: string;
  addressed: boolean | null;
  supportLevel: SupportLevel | null;
  progress: ProgressLevel | null;
  comment: string | null;
};

/** An outcome with no answer yet — neither worked on nor ruled out. */
export function isOutcomeUnanswered(entry: NoteOutcome | undefined): boolean {
  return !entry || entry.addressed === null;
}

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
  /** The questions printed on the paper form, with {name} placeholders. */
  prompts: string[];
  sections: FormSection[];
  narrative: { key: string; type: 'narrative'; label: string; min_length?: number };
  signature: { key: string; type: 'signature'; attestation: string };
  /**
   * Starter service-plan outcomes offered to a supervisor in this jurisdiction.
   *
   * Optional. When a template omits it, the resident's plan starts empty and
   * the "start from the library" affordance is simply not offered — which is a
   * better outcome than offering another state's vocabulary.
   */
  outcome_library?: LibraryOutcome[];
};

// ---------------------------------------------------------------------------
// Print layout
//
// The renderer draws whatever the template tells it to draw, from a closed set
// of value sources. It is a closed set on purpose: a template is data loaded
// from the database, and letting a row name an arbitrary expression would make
// the PDF renderer an evaluator for untrusted input.
// ---------------------------------------------------------------------------

/**
 * Everything a printed form is allowed to say about a note.
 *
 * Every member is resolved once per render by `buildPrintContext()`. A template
 * that names a source the caller could not resolve prints a blank, exactly like
 * an unfilled field on the paper form — never a placeholder, never an error,
 * and never a value borrowed from somewhere else.
 */
export const PRINT_SOURCES = [
  'resident_legal_name',
  'resident_preferred_name',
  'medicaid_id',
  'service_date',
  'shift_label',
  'shift_start',
  'shift_stop',
  'org_line',
  'provider_id',
  'place_of_service',
  'service_type',
  'group_size',
  'signature_name',
  'signature_title'
] as const;

export type PrintSource = (typeof PRINT_SOURCES)[number];

export type PrintContext = Record<PrintSource, string>;

/** One labelled blank on the printed form. */
export type PrintField = {
  /**
   * Where the value comes from. **Omit it to print an empty ruled line.**
   *
   * A jurisdiction sometimes requires a field this app does not hold — Ohio's
   * rule asks for billing units, which live in the agency's billing system, not
   * here. Printing the label with an empty blank is what a paper form does and
   * is the honest answer: the required field is present and visibly unfilled.
   * Inventing a value, or silently dropping the element, would both be worse.
   */
  source?: PrintSource;
  label: string;
  /** Width of the ruled blank in PDF points. Defaults to 120. */
  width?: number;
  /** Share the row evenly rather than sitting at its natural width. */
  grow?: boolean;
};

export type PrintRow = { fields: PrintField[] };

/**
 * How one jurisdiction's document is laid out.
 *
 * Every key is optional and every default reproduces the original Virginia
 * layout exactly as it printed before templates existed. That is deliberate:
 * the shipped Virginia row carries none of these keys, so "omitted" has to mean
 * "unchanged" or the regression bar could not be met.
 *
 * One thing changed rather than being reproduced: the footer no longer carries
 * a form number. `0040` retracted "Form #680", which never existed — 680 is a
 * section of 12VAC35-105. Set `footer.form_line` only from a document the state
 * actually publishes.
 */
export type RenderConfig = {
  page?: {
    size?: string;
    margin?: number;
    /**
     * Space reserved at the foot of every page for the fixed footer block.
     *
     * Defaults to 76, which is what the default footer needs for its form line, agency
     * line and Title/Date row. A template with a taller footer — Ohio adds a
     * rule citation — must raise this, or the signature row is drawn on top of
     * it. Content overlapping the footer of a signed Medicaid record is not a
     * cosmetic problem.
     */
    padding_bottom?: number;
  };
  header?: { logo?: string; org_line?: string; title?: string };
  footer?: {
    form_line?: string;
    /**
     * The rule or form this layout was built from, printed small under the
     * form line. Cite a real, public source or leave it out — an invented
     * citation on a Medicaid document is worse than none.
     */
    legal_citation?: string;
  };
  narrative_min_height?: number;

  /**
   * What service this document records, in the jurisdiction's own words —
   * Ohio's rule asks for "type of service" and its answer for a group home is
   * "Homemaker/Personal Care". Printed only where a template's layout asks for
   * the `service_type` source, so Virginia's layout is unaffected.
   */
  service_type?: string;

  /** Identity blanks above the title. Defaults to the name + Medicaid row. */
  identity_rows?: PrintRow[];
  /** Blanks between the title and the prompts. Defaults to the date + shift row. */
  meta_rows?: PrintRow[];

  signature_block?: {
    /** Defaults to 'Staff Signature: '. */
    label?: string;
    /**
     * Fixed width for that label, in points.
     *
     * Leave it unset for a short label — the default 'Staff Signature: ' sizes
     * itself and must keep doing so, byte for byte. Set it for a long one:
     * without an explicit width the text engine will wrap a long label into a
     * narrow column rather than let it take the room it needs.
     */
    label_width?: number;
    /** Width of the ruled signature line when there is no drawn mark. Defaults to 200. */
    value_width?: number;
    /** Fields printed in the fixed page footer. Defaults to #680's Title + Date. */
    footer_fields?: PrintField[];
  };

  /** The service-plan page. Omit `enabled: false` to keep it. */
  outcome_page?: {
    enabled?: boolean;
    /** `{resident}`, `{date}`, `{shift}` are substituted. */
    heading?: string;
    status_labels?: {
      addressed?: string;
      not_addressed?: string;
      unanswered?: string;
    };
    activity_labels?: { yes?: string; no?: string; unanswered?: string };
  };

  addenda_page?: { heading?: string };

  /**
   * Printed labels for the support/progress vocabulary.
   *
   * Labels only. The stored VALUES are Postgres enums
   * (`ghh.outcome_support_level`, `ghh.outcome_progress`), so a jurisdiction
   * can rename "With verbal prompts" but cannot invent a sixth support level
   * without a migration. docs/adding-a-state.md says so too.
   */
  support_level_labels?: Partial<Record<SupportLevel, string>>;
  progress_labels?: Partial<Record<ProgressLevel, string>>;
};

export type FormTemplate = {
  id: string;
  key: string;
  version: number;
  name: string;
  formNumber: string | null;
  /** 'US-VA', 'US-OH', or the reserved 'GENERIC'. */
  jurisdiction: string;
  schema: FormTemplateSchema;
  renderConfig: RenderConfig;
};

/** The no-state-claimed fallback. Not a place. */
export const GENERIC_JURISDICTION = 'GENERIC';

// ---------------------------------------------------------------------------
// Starter outcome library
//
// Carried inside a template's `schema.outcome_library`, so adding a state's
// vocabulary is part of authoring its template row rather than editing a
// TypeScript module and redeploying.
// ---------------------------------------------------------------------------

export type LibraryActivity = {
  description: string;
  measureType: MeasureType;
  measure: string;
  supportInstructions: string;
  dailyQuestion: string;
};

export type LibraryOutcome = {
  key: string;
  title: string;
  lens: 'independence' | 'integration' | 'quality_of_life';
  importantTo: string;
  importantFor?: string;
  statement: string;
  frequency: string;
  activities: LibraryActivity[];
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
  /**
   * Set when this draft was prepared ahead of the shift rather than opened by
   * hand, carrying the resident's usual pattern. It is provenance, not a claim:
   * nothing prepared has been observed by anyone.
   */
  prestagedAt: string | null;
  /**
   * Set when a DSP confirmed the prepared entries describe the shift they
   * worked. Signing is refused until then, by the route and by the database.
   */
  prestageConfirmedAt: string | null;
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
