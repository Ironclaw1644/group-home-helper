import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { interpolate } from '@/lib/forms/interpolate';
import { formatServiceDate } from '@/lib/utils';
import type { FormTemplate, Note, NoteAddendum, Resident } from '@/lib/types';
import { displayName, PROGRESS_LEVELS, SUPPORT_LEVELS } from '@/lib/types';
import type {
  NoteActivity,
  NoteOutcome,
  Outcome,
  OutcomeActivity
} from '@/lib/types';

/**
 * Form #680 — Daily Progress Note.
 *
 * This is a deliberate recreation of the paper form in EE/detail.jpg: the same
 * header, the same five numbered prompts, the same narrative block, and the
 * same "Daily Progress Notes Form #680" / "Title: ___ Date: ___" footer. An
 * auditor comparing a printout against the binder should see one form.
 *
 * Training examples render through this same component with no watermark and
 * no distinguishing mark — a stamped-up sample teaches nothing, so trainees
 * see exactly what their own finished note should look like.
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

function Blank({ value, width }: { value: string; width: number }) {
  return (
    <Text style={[styles.fieldValue, { width }]}>{value || ' '}</Text>
  );
}

export type Form680Props = {
  note: Note;
  resident: Resident;
  template: FormTemplate;
  shiftLabel: string;
  addenda: NoteAddendum[];
  orgLine: string;
  /** Data URL or absolute path react-pdf can resolve. */
  logoSrc?: string | null;
  signatureSrc?: string | null;
  /** This resident's ISP outcomes and what was documented against them. */
  outcomes?: Outcome[];
  noteOutcomes?: NoteOutcome[];
  activities?: OutcomeActivity[];
  noteActivities?: NoteActivity[];
};

export function Form680({
  note,
  resident,
  template,
  shiftLabel,
  addenda,
  orgLine,
  logoSrc,
  signatureSrc,
  outcomes = [],
  noteOutcomes = [],
  activities = [],
  noteActivities = []
}: Form680Props) {
  // The five printed questions read naturally with the preferred name...
  const ctx = { name: displayName(resident), pronouns: resident.pronouns };
  // ...but "Individual's Name" is the identity field on a Medicaid document
  // and must carry the legal name, whatever the house calls them.
  const residentName = `${resident.firstName} ${resident.lastName}`;
  const serviceDate = formatServiceDate(note.serviceDate);
  const config = template.renderConfig;

  return (
    <Document
      title={`Daily Progress Note — ${residentName} — ${serviceDate}`}
      author={orgLine}
      creator={orgLine}
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
          <Text style={styles.orgName}>{config.header?.org_line ?? orgLine}</Text>
        </View>

        <View style={styles.identityRow}>
          <View style={[styles.identityCell, { flex: 1 }]}>
            <Text style={styles.fieldLabel}>Individual&apos;s Name: </Text>
            <Blank value={residentName} width={190} />
          </View>
          <View style={styles.identityCell}>
            <Text style={styles.fieldLabel}>Medicaid: </Text>
            <Blank value={resident.medicaidId ?? ''} width={120} />
          </View>
        </View>

        <Text style={styles.title}>{config.header?.title ?? template.name}</Text>

        <View style={styles.metaRow}>
          <View style={styles.identityCell}>
            <Text style={styles.fieldLabel}>Date: </Text>
            <Blank value={serviceDate} width={110} />
          </View>
          <View style={styles.identityCell}>
            <Text style={styles.fieldLabel}>Shift/Time: </Text>
            <Blank value={shiftLabel} width={110} />
          </View>
        </View>

        {/* The five prompts, run together on one line exactly as printed. */}
        <View style={styles.prompts}>
          <Text style={styles.promptText}>
            {template.schema.prompts
              .map((p, i) => `${i + 1}. ${interpolate(p, ctx)}`)
              .join('  ')}
          </Text>
        </View>

        <View style={[styles.narrativeBox, { minHeight: config.narrative_min_height ?? 340 }]}>
          <Text style={styles.narrativeText}>{note.narrative}</Text>
        </View>

        <View style={styles.signatureRow}>
          <Text style={styles.fieldLabel}>Staff Signature: </Text>
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
          <Text style={styles.footerFormLine}>
            {config.footer?.form_line ?? `Daily Progress Notes Form #${template.formNumber ?? ''}`}
          </Text>
          <View style={styles.footerRow}>
            <View style={styles.identityCell}>
              <Text style={styles.fieldLabel}>Title: </Text>
              <Blank value={note.signatureTitle ?? ''} width={90} />
            </View>
            <View style={styles.identityCell}>
              <Text style={styles.fieldLabel}>Date: </Text>
              <Blank value={serviceDate} width={90} />
            </View>
          </View>
        </View>
      </Page>

      {/* Service-plan documentation on its own page.
          This is the page a Virginia reviewer actually checks: it puts the
          outcome statement from the ISP next to what was documented against it,
          so the comparison they would otherwise do across two documents is
          already made on one sheet. */}
      {outcomes.length > 0 ? (
        <Page size="LETTER" style={styles.page}>
          <View style={styles.headerRow}>
            {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
            <Text style={styles.orgName}>{config.header?.org_line ?? orgLine}</Text>
          </View>

          <Text style={styles.addendaHeading}>
            Service Plan Documentation — {residentName}, {serviceDate}, {shiftLabel}
          </Text>

          {outcomes.map((outcome) => {
            const entry = noteOutcomes.find((n) => n.outcomeId === outcome.id);
            const mine = activities.filter((a) => a.outcomeId === outcome.id);
            const support = SUPPORT_LEVELS.find((s) => s.value === entry?.supportLevel)?.label;
            const progress = PROGRESS_LEVELS.find((p) => p.value === entry?.progress)?.label;

            return (
              <View key={outcome.id} style={styles.outcomeBlock} wrap={false}>
                <Text style={styles.outcomeTitle}>
                  {outcome.title} — {entry?.addressed ? 'Addressed this shift' : 'Not addressed this shift'}
                </Text>

                {outcome.statement ? (
                  <Text style={styles.outcomeStatement}>{outcome.statement}</Text>
                ) : null}

                {entry?.addressed && (support || progress) ? (
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
                      ? 'Yes'
                      : answer?.completed === false
                        ? 'No'
                        : 'Not recorded';

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
            <Text style={styles.footerFormLine}>
              {config.footer?.form_line ?? `Daily Progress Notes Form #${template.formNumber ?? ''}`}
            </Text>
          </View>
        </Page>
      ) : null}

      {/* Addenda live on their own page so the signed note above stays exactly
          as it was signed — nothing is reflowed by a later correction. */}
      {addenda.length > 0 ? (
        <Page size="LETTER" style={styles.page}>
          <View style={styles.headerRow}>
            {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
            <Text style={styles.orgName}>{config.header?.org_line ?? orgLine}</Text>
          </View>

          <Text style={styles.addendaHeading}>
            Addenda — {residentName}, {serviceDate}, {shiftLabel}
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
            <Text style={styles.footerFormLine}>
              {config.footer?.form_line ?? `Daily Progress Notes Form #${template.formNumber ?? ''}`}
            </Text>
          </View>
        </Page>
      ) : null}
    </Document>
  );
}
