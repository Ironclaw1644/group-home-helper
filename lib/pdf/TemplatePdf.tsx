import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { interpolate } from '@/lib/forms/interpolate';
import { outcomeStatus } from '@/lib/outcomes/answered';
import { readSource } from '@/lib/pdf/print-context';
import type {
  FormTemplate,
  Note,
  NoteAddendum,
  PrintContext,
  PrintField,
  PrintRow,
  ProgressLevel,
  RenderConfig,
  Resident,
  SupportLevel
} from '@/lib/types';
import { displayName, PROGRESS_LEVELS, SUPPORT_LEVELS } from '@/lib/types';
import type {
  NoteActivity,
  NoteOutcome,
  Outcome,
  OutcomeActivity
} from '@/lib/types';

/**
 * The generic, template-driven progress-note renderer.
 *
 * This component draws whatever the template's `render_config` describes. It
 * has no idea which state it is printing for, and there is no branch anywhere
 * below on a form number, a jurisdiction, or an agency. Virginia's Form #680 is
 * the first template rather than a special case — it reaches this renderer as a
 * row, exactly like Ohio's does.
 *
 * Three rules hold the design together:
 *
 *   1. **The template describes the form.** Labels, field order, page headings
 *      and the outcome vocabulary all come from `render_config`.
 *
 *   2. **The org describes who filed it.** `orgLine`, `letterhead`, `address`,
 *      `footerLine` and `logoSrc` are supplied by the caller from the
 *      requesting user's own organization and are never read off the template —
 *      the shipped #680 row is global, shared by every agency on the install,
 *      so an identity there would print on everybody's Medicaid records. That
 *      is a bug this codebase has already had once.
 *
 *   3. **Every default is Form #680.** A template that sets none of the new
 *      keys renders exactly what shipped before templates existed. The #680 row
 *      in production sets none of them, which is what makes that provable —
 *      see scripts/verify-jurisdictions.tsx.
 *
 * Training examples render through here with no watermark and no distinguishing
 * mark: a stamped-up sample teaches nothing, so trainees see exactly what their
 * own finished note should look like.
 */

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    // Clears the fixed footer block (form line + Title/Date row).
    paddingBottom: 76,
    paddingHorizontal: 42,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111111',
    lineHeight: 1.4,
    display: 'flex',
    flexDirection: 'column'
  },

  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  logo: { width: 54, height: 54, objectFit: 'contain', marginRight: 12 },
  orgName: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  orgLetterhead: { fontSize: 9.5, marginTop: 2 },
  orgAddress: { fontSize: 8.5, color: '#444444', marginTop: 2 },

  identityRow: { flexDirection: 'row', marginBottom: 14 },
  identityCell: { flexDirection: 'row', alignItems: 'flex-end' },
  fieldLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  // Underscored blanks reproduce the ruled fields on the paper form.
  fieldValue: {
    fontSize: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#111111',
    paddingHorizontal: 4,
    paddingBottom: 1
  },

  title: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 12
  },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },

  prompts: { marginBottom: 10 },
  promptText: { fontSize: 9, lineHeight: 1.5 },

  narrativeBox: {
    borderWidth: 1,
    borderColor: '#111111',
    padding: 10,
    marginBottom: 16,
    // Fill the page the way the ruled area does on the paper form, so the
    // signature line lands just above the footer instead of floating mid-page.
    flexGrow: 1
  },
  narrativeText: { fontSize: 10, lineHeight: 1.65, textAlign: 'justify' },

  outcomeBlock: {
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#c9d2da'
  },
  outcomeTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  outcomeStatement: { fontSize: 9, lineHeight: 1.5, marginBottom: 3 },
  outcomeMeta: { fontSize: 8.5, color: '#536779', marginBottom: 4 },
  outcomeComment: { fontSize: 9, lineHeight: 1.5, marginTop: 4 },
  activityRow: { flexDirection: 'row', marginBottom: 3 },
  activityAnswer: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    width: 62
  },
  activityText: { fontSize: 9, lineHeight: 1.45, flex: 1 },
  signatureRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6 },
  signatureImage: { width: 150, height: 42, objectFit: 'contain' },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#111111',
    width: 200,
    marginLeft: 4
  },

  footer: {
    position: 'absolute',
    bottom: 24,
    left: 42,
    right: 42
  },
  footerFormLine: { fontSize: 9, marginBottom: 4 },
  footerCitation: { fontSize: 7, color: '#666666', marginBottom: 4 },
  footerAgencyLine: { fontSize: 8, color: '#444444', marginBottom: 4 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },

  addendaHeading: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginTop: 4,
    marginBottom: 8
  },
  addendum: { marginBottom: 12 },
  addendumMeta: { fontSize: 8, color: '#444444', marginTop: 3 }
});

// ---------------------------------------------------------------------------
// Defaults
//
// These ARE Form #680. The shipped #680 template row carries none of the layout
// keys below, so these constants are what it prints — which is exactly why they
// are written as the fallback rather than as an "example" template. Changing
// one changes a signed Medicaid record's appearance; verify:jurisdictions
// fails if any of them drift.
// ---------------------------------------------------------------------------

const DEFAULT_IDENTITY_ROWS: PrintRow[] = [
  {
    fields: [
      { source: 'resident_legal_name', label: "Individual's Name: ", width: 190, grow: true },
      { source: 'medicaid_id', label: 'Medicaid: ', width: 120 }
    ]
  }
];

const DEFAULT_META_ROWS: PrintRow[] = [
  {
    fields: [
      { source: 'service_date', label: 'Date: ', width: 110 },
      { source: 'shift_label', label: 'Shift/Time: ', width: 110 }
    ]
  }
];

const DEFAULT_SIGNATURE_LABEL = 'Staff Signature: ';

const DEFAULT_SIGNATURE_FOOTER_FIELDS: PrintField[] = [
  { source: 'signature_title', label: 'Title: ', width: 90 },
  { source: 'service_date', label: 'Date: ', width: 90 }
];

const DEFAULT_OUTCOME_HEADING = 'Service Plan Documentation — {resident}, {date}, {shift}';
const DEFAULT_ADDENDA_HEADING = 'Addenda — {resident}, {date}, {shift}';

const DEFAULT_STATUS_LABELS = {
  addressed: 'Addressed this shift',
  not_addressed: 'Not addressed this shift',
  unanswered: 'Not recorded — no answer documented'
} as const;

const DEFAULT_ACTIVITY_LABELS = {
  yes: 'Yes',
  no: 'No',
  unanswered: 'Not recorded'
} as const;

/**
 * A page heading, as the sequence of text runs react-pdf would have received
 * from JSX interpolation.
 *
 * Returning runs rather than one joined string is not fussiness: react-pdf
 * emits one `TJ` operator per text child, so `Addenda — {resident}` written as
 * JSX produces a different content stream from the same characters passed as a
 * single string. The rendered page looks identical either way, but the PDF
 * bytes do not — and the Virginia regression bar is byte-level. Splitting the
 * pattern on its placeholders reproduces exactly the child list the JSX had.
 *
 * Empty runs are dropped, which is what JSX does with a trailing literal and is
 * output-equivalent for an empty value.
 */
function headingRuns(
  pattern: string,
  parts: { resident: string; date: string; shift: string }
): string[] {
  return pattern
    .split(/(\{resident\}|\{date\}|\{shift\})/g)
    .map((piece) =>
      piece === '{resident}'
        ? parts.resident
        : piece === '{date}'
          ? parts.date
          : piece === '{shift}'
            ? parts.shift
            : piece
    )
    .filter((run) => run !== '');
}

function Blank({ value, width }: { value: string; width: number }) {
  return <Text style={[styles.fieldValue, { width }]}>{value || ' '}</Text>;
}

/** One labelled blank, resolved from the print context. */
function Field({ field, ctx }: { field: PrintField; ctx: PrintContext }) {
  return (
    <View style={field.grow ? [styles.identityCell, { flex: 1 }] : styles.identityCell}>
      <Text style={styles.fieldLabel}>{field.label}</Text>
      <Blank value={readSource(ctx, field.source)} width={field.width ?? 120} />
    </View>
  );
}

function FieldRow({
  row,
  ctx,
  style
}: {
  row: PrintRow;
  ctx: PrintContext;
  style: (typeof styles)['identityRow'] | (typeof styles)['metaRow'];
}) {
  return (
    <View style={style}>
      {row.fields.map((field, i) => (
        <Field key={`${field.source}-${i}`} field={field} ctx={ctx} />
      ))}
    </View>
  );
}

/**
 * The agency identity block at the top of every page.
 *
 * `template.renderConfig.header.org_line` is deliberately NOT consulted here.
 * The shipped Form #680 template is global (`org_id` null) and carried one
 * agency's legal name and logo path, so honouring it printed that agency's
 * letterhead on every other agency's forms — which is the whole bug the
 * org-scoped props exist to fix. The template describes the *form*; the org
 * describes *who filed it*, and only the org may say that.
 */
function Letterhead({
  orgLine,
  letterhead,
  address,
  logoSrc
}: {
  orgLine: string;
  letterhead?: string | null;
  address?: string | null;
  logoSrc?: string | null;
}) {
  return (
    <View style={styles.headerRow}>
      {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
      <View>
        <Text style={styles.orgName}>{orgLine}</Text>
        {letterhead ? <Text style={styles.orgLetterhead}>{letterhead}</Text> : null}
        {address ? <Text style={styles.orgAddress}>{address}</Text> : null}
      </View>
    </View>
  );
}

/**
 * The form line, its citation, plus the agency's own footer when it has one.
 *
 * The form number stays whatever the template says. It identifies the document
 * a reviewer is holding, so it is not the agency's to overwrite — an agency
 * footer is added as a further line rather than replacing it.
 */
function FormFooter({
  formLine,
  citation,
  footerLine
}: {
  formLine: string;
  citation?: string | null;
  footerLine?: string | null;
}) {
  return (
    <>
      <Text style={styles.footerFormLine}>{formLine}</Text>
      {citation ? <Text style={styles.footerCitation}>{citation}</Text> : null}
      {footerLine ? <Text style={styles.footerAgencyLine}>{footerLine}</Text> : null}
    </>
  );
}

export type TemplatePdfProps = {
  note: Note;
  resident: Resident;
  template: FormTemplate;
  /** Resolved values the template may draw on. See lib/pdf/print-context.ts. */
  ctx: PrintContext;
  shiftLabel: string;
  addenda: NoteAddendum[];
  /**
   * The agency this document belongs to. Always supplied by the caller from
   * the requesting user's own organization — there is no default, because a
   * default here is another agency's letterhead on someone's Medicaid record.
   */
  orgLine: string;
  /** Optional second identity line: a division, program, or DBA. */
  letterhead?: string | null;
  /** Optional address block under the agency name. */
  address?: string | null;
  /** Optional agency footer, printed under the form line rather than over it. */
  footerLine?: string | null;
  /** Data URL or absolute path react-pdf can resolve. */
  logoSrc?: string | null;
  signatureSrc?: string | null;
  /** This resident's ISP outcomes and what was documented against them. */
  outcomes?: Outcome[];
  noteOutcomes?: NoteOutcome[];
  activities?: OutcomeActivity[];
  noteActivities?: NoteActivity[];
};

export function TemplatePdf({
  note,
  resident,
  template,
  ctx,
  shiftLabel,
  addenda,
  orgLine,
  letterhead,
  address,
  footerLine,
  logoSrc,
  signatureSrc,
  outcomes = [],
  noteOutcomes = [],
  activities = [],
  noteActivities = []
}: TemplatePdfProps) {
  // The printed questions read naturally with the preferred name...
  const promptCtx = { name: displayName(resident), pronouns: resident.pronouns };
  // ...but the identity fields carry the legal name, whatever the house calls
  // them. Both come out of the print context rather than being derived here.
  const residentName = ctx.resident_legal_name;
  const serviceDate = ctx.service_date;
  const config: RenderConfig = template.renderConfig;

  // The form number identifies the document and comes from the template. The
  // agency identity does not — see Letterhead above.
  const formLine =
    config.footer?.form_line ?? `Daily Progress Notes Form #${template.formNumber ?? ''}`;
  const citation = config.footer?.legal_citation ?? null;

  const identityRows = config.identity_rows ?? DEFAULT_IDENTITY_ROWS;
  const metaRows = config.meta_rows ?? DEFAULT_META_ROWS;
  const signatureLabel = config.signature_block?.label ?? DEFAULT_SIGNATURE_LABEL;
  const signatureFooterFields =
    config.signature_block?.footer_fields ?? DEFAULT_SIGNATURE_FOOTER_FIELDS;

  const statusLabels = { ...DEFAULT_STATUS_LABELS, ...config.outcome_page?.status_labels };
  const activityLabels = { ...DEFAULT_ACTIVITY_LABELS, ...config.outcome_page?.activity_labels };
  const headingParts = { resident: residentName, date: serviceDate, shift: shiftLabel };

  const supportLabel = (value: SupportLevel | null | undefined) =>
    (value ? config.support_level_labels?.[value] : undefined) ??
    SUPPORT_LEVELS.find((s) => s.value === value)?.label;
  const progressLabel = (value: ProgressLevel | null | undefined) =>
    (value ? config.progress_labels?.[value] : undefined) ??
    PROGRESS_LEVELS.find((p) => p.value === value)?.label;

  // A jurisdiction whose form has no service-plan page can turn it off, but the
  // default is on: the page comparing the ISP outcome against what was
  // documented is the one a reviewer actually checks.
  const showOutcomePage = config.outcome_page?.enabled !== false && outcomes.length > 0;

  return (
    <Document
      title={`Daily Progress Note — ${residentName} — ${serviceDate}`}
      author={orgLine}
      creator={orgLine}
    >
      <Page size="LETTER" style={styles.page}>
        <Letterhead
          orgLine={orgLine}
          letterhead={letterhead}
          address={address}
          logoSrc={logoSrc}
        />

        {identityRows.map((row, i) => (
          <FieldRow key={`identity-${i}`} row={row} ctx={ctx} style={styles.identityRow} />
        ))}

        <Text style={styles.title}>{config.header?.title ?? template.name}</Text>

        {metaRows.map((row, i) => (
          <FieldRow key={`meta-${i}`} row={row} ctx={ctx} style={styles.metaRow} />
        ))}

        {/* The prompts, run together on one line exactly as printed. */}
        <View style={styles.prompts}>
          <Text style={styles.promptText}>
            {template.schema.prompts
              .map((p, i) => `${i + 1}. ${interpolate(p, promptCtx)}`)
              .join('  ')}
          </Text>
        </View>

        <View style={[styles.narrativeBox, { minHeight: config.narrative_min_height ?? 340 }]}>
          <Text style={styles.narrativeText}>{note.narrative}</Text>
        </View>

        <View style={styles.signatureRow}>
          <Text style={styles.fieldLabel}>{signatureLabel}</Text>
          {signatureSrc ? (
            <Image src={signatureSrc} style={styles.signatureImage} />
          ) : (
            <Text style={[styles.fieldValue, { width: 200 }]}>{note.signatureName ?? ' '}</Text>
          )}
        </View>

        {signatureSrc && note.signatureName ? (
          <Text style={{ fontSize: 8, color: '#444444', marginBottom: 6 }}>
            {note.signatureName}
          </Text>
        ) : null}

        <View style={styles.footer} fixed>
          <FormFooter formLine={formLine} citation={citation} footerLine={footerLine} />
          <View style={styles.footerRow}>
            {signatureFooterFields.map((field, i) => (
              <Field key={`sigfoot-${i}`} field={field} ctx={ctx} />
            ))}
          </View>
        </View>
      </Page>

      {/* Service-plan documentation on its own page.
          This is the page a reviewer actually checks: it puts the outcome
          statement from the ISP next to what was documented against it, so the
          comparison they would otherwise do across two documents is already
          made on one sheet. */}
      {showOutcomePage ? (
        <Page size="LETTER" style={styles.page}>
          <Letterhead
            orgLine={orgLine}
            letterhead={letterhead}
            address={address}
            logoSrc={logoSrc}
          />

          <Text style={styles.addendaHeading}>
            {headingRuns(config.outcome_page?.heading ?? DEFAULT_OUTCOME_HEADING, headingParts)}
          </Text>

          {outcomes.map((outcome) => {
            const entry = noteOutcomes.find((n) => n.outcomeId === outcome.id);
            const mine = activities.filter((a) => a.outcomeId === outcome.id);
            const support = supportLabel(entry?.supportLevel);
            const progress = progressLabel(entry?.progress);

            // Three states, not two. "Not addressed this shift" is a statement
            // someone made about this person's service plan; an outcome with no
            // entry is a gap in the record and has to read as one, exactly like
            // an unanswered activity below. Printing a blank as a negative
            // would put an unmade clinical claim on a Medicaid document.
            //
            // Every template gets all three. A template may rename them; it
            // cannot collapse unanswered into not-addressed, because the label
            // set is merged over the defaults rather than replacing them.
            const status = statusLabels[outcomeStatus(entry)];

            return (
              <View key={outcome.id} style={styles.outcomeBlock} wrap={false}>
                <Text style={styles.outcomeTitle}>
                  {outcome.title} — {status}
                </Text>

                {outcome.statement ? (
                  <Text style={styles.outcomeStatement}>{outcome.statement}</Text>
                ) : null}

                {entry?.addressed === true && (support || progress) ? (
                  <Text style={styles.outcomeMeta}>
                    {[support, progress].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}

                {mine.map((activity) => {
                  const answer = noteActivities.find((n) => n.activityId === activity.id);
                  // An unanswered activity prints as "Not recorded" rather than
                  // being omitted. A reviewer needs to see the gap, not have it
                  // hidden by the layout.
                  const label =
                    answer?.completed === true
                      ? activityLabels.yes
                      : answer?.completed === false
                        ? activityLabels.no
                        : activityLabels.unanswered;

                  return (
                    <View key={activity.id} style={styles.activityRow}>
                      <Text style={styles.activityAnswer}>{label}</Text>
                      <Text style={styles.activityText}>
                        {activity.dailyQuestion || activity.description}
                        {answer?.concern ? '  [concern noted]' : ''}
                        {answer?.comment ? `\n${answer.comment}` : ''}
                      </Text>
                    </View>
                  );
                })}

                {entry?.comment ? (
                  <Text style={styles.outcomeComment}>{entry.comment}</Text>
                ) : null}
              </View>
            );
          })}

          <View style={styles.footer} fixed>
            <FormFooter formLine={formLine} citation={citation} footerLine={footerLine} />
          </View>
        </Page>
      ) : null}

      {/* Addenda live on their own page so the signed note above stays exactly
          as it was signed — nothing is reflowed by a later correction. */}
      {addenda.length > 0 ? (
        <Page size="LETTER" style={styles.page}>
          <Letterhead
            orgLine={orgLine}
            letterhead={letterhead}
            address={address}
            logoSrc={logoSrc}
          />

          <Text style={styles.addendaHeading}>
            {headingRuns(config.addenda_page?.heading ?? DEFAULT_ADDENDA_HEADING, headingParts)}
          </Text>

          {addenda.map((a) => (
            <View key={a.id} style={styles.addendum} wrap={false}>
              <Text style={styles.narrativeText}>{a.body}</Text>
              <Text style={styles.addendumMeta}>
                {a.signatureName} · {a.signatureTitle} · {new Date(a.createdAt).toLocaleString()}
              </Text>
            </View>
          ))}

          <View style={styles.footer} fixed>
            <FormFooter formLine={formLine} citation={citation} footerLine={footerLine} />
          </View>
        </Page>
      ) : null}
    </Document>
  );
}
