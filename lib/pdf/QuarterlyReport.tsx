import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatServiceDate } from '@/lib/utils';
import { displayName } from '@/lib/types';
import type { Outcome, Resident } from '@/lib/types';
import type { OutcomeProgressRow } from '@/lib/outcomes/repo';

/**
 * Quarterly progress review.
 *
 * Virginia support coordinators review the ISP quarterly, and providers are
 * expected to show progress toward each outcome over that period. Done by hand
 * this means reading ninety days of notes per person and counting — hours of
 * work per resident, every quarter, which is exactly the job software should
 * do.
 *
 * The numbers here are counted from signed notes only. A draft is not a record,
 * and a report that counted unsigned work would overstate what was actually
 * documented — which is the direction of error that gets a provider in trouble.
 */

const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 56, paddingHorizontal: 46, fontSize: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  logo: { width: 90, height: 30, objectFit: 'contain', marginRight: 10 },
  orgName: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  orgLetterhead: { fontSize: 9, marginTop: 2 },
  orgAddress: { fontSize: 8, color: '#536779', marginTop: 2 },

  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subtitle: { fontSize: 10, color: '#536779', marginBottom: 16 },

  summaryRow: {
    flexDirection: 'row',
    borderWidth: 0.5,
    borderColor: '#c9d2da',
    borderRadius: 4,
    padding: 10,
    marginBottom: 18
  },
  summaryCell: { flex: 1 },
  summaryNumber: { fontSize: 17, fontFamily: 'Helvetica-Bold' },
  summaryLabel: { fontSize: 8, color: '#536779', marginTop: 1 },

  outcome: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#c9d2da'
  },
  outcomeTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  statement: { fontSize: 9.5, lineHeight: 1.5, marginBottom: 6 },
  meta: { fontSize: 8.5, color: '#536779', marginBottom: 6 },

  counts: { flexDirection: 'row', marginBottom: 4 },
  count: { marginRight: 18 },
  countNumber: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  countLabel: { fontSize: 7.5, color: '#536779' },

  flag: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#8a5a00',
    marginTop: 4
  },

  signatureBlock: { marginTop: 26 },
  signatureLine: {
    borderBottomWidth: 0.75,
    borderBottomColor: '#0f2d45',
    width: 240,
    height: 22,
    marginBottom: 3
  },
  signatureLabel: { fontSize: 8.5, color: '#536779' },

  footer: {
    position: 'absolute',
    bottom: 26,
    left: 46,
    right: 46,
    borderTopWidth: 0.5,
    borderTopColor: '#c9d2da',
    paddingTop: 6
  },
  footerText: { fontSize: 8, color: '#536779', textAlign: 'center' }
});

export type QuarterlyReportProps = {
  resident: Resident;
  outcomes: Outcome[];
  progress: OutcomeProgressRow[];
  from: string;
  to: string;
  /**
   * The agency this report belongs to, taken from the requesting user's own
   * organization. No default — a default is someone else's letterhead.
   */
  orgLine: string;
  letterhead?: string | null;
  address?: string | null;
  footerLine?: string | null;
  /**
   * "Today" as the agency's own timezone sees it. Passed in rather than read
   * from the server clock: a report generated at 22:00 Pacific must not be
   * dated tomorrow because the host runs in UTC.
   */
  generatedOn: string;
  signedNoteCount: number;
  logoSrc?: string | null;
};

export function QuarterlyReport({
  resident,
  outcomes,
  progress,
  from,
  to,
  orgLine,
  letterhead,
  address,
  footerLine,
  generatedOn,
  signedNoteCount,
  logoSrc
}: QuarterlyReportProps) {
  const known = displayName(resident);
  const legalName = `${resident.firstName} ${resident.lastName}`;

  const totalAddressed = progress.reduce((n, p) => n + p.timesAddressed, 0);
  const anyProgress = progress.reduce((n, p) => n + p.progressed, 0);
  const concerns = progress.reduce((n, p) => n + p.regressed + p.declined, 0);

  return (
    <Document
      title={`Quarterly Progress Review — ${legalName} — ${from} to ${to}`}
      author={orgLine}
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerRow}>
          {logoSrc ? <Image src={logoSrc} style={styles.logo} /> : null}
          <View>
            <Text style={styles.orgName}>{orgLine}</Text>
            {letterhead ? <Text style={styles.orgLetterhead}>{letterhead}</Text> : null}
            {address ? <Text style={styles.orgAddress}>{address}</Text> : null}
          </View>
        </View>

        <Text style={styles.title}>Quarterly Progress Review</Text>
        <Text style={styles.subtitle}>
          {legalName}
          {known.toLowerCase() !== resident.firstName.toLowerCase() ? ` (known as ${known})` : ''}
          {'  ·  '}
          {formatServiceDate(from)} to {formatServiceDate(to)}
        </Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryNumber}>{signedNoteCount}</Text>
            <Text style={styles.summaryLabel}>Signed notes in period</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryNumber}>{outcomes.length}</Text>
            <Text style={styles.summaryLabel}>Outcomes in the plan</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryNumber}>{totalAddressed}</Text>
            <Text style={styles.summaryLabel}>Times addressed</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryNumber}>{anyProgress}</Text>
            <Text style={styles.summaryLabel}>Progress recorded</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryNumber}>{concerns}</Text>
            <Text style={styles.summaryLabel}>Setbacks or refusals</Text>
          </View>
        </View>

        {progress.map((row) => {
          const outcome = outcomes.find((o) => o.id === row.outcomeId);
          const total = row.timesAddressed + row.timesNotAddressed;
          const rate = total > 0 ? Math.round((row.timesAddressed / total) * 100) : 0;

          // Two things a reviewer looks for, surfaced rather than left to be
          // spotted: an outcome nobody worked on, and one where the record
          // shows more setback than progress.
          const neverAddressed = row.timesAddressed === 0;
          const losingGround = row.regressed + row.declined > row.progressed && row.timesAddressed > 0;

          return (
            <View key={row.outcomeId} style={styles.outcome} wrap={false}>
              <Text style={styles.outcomeTitle}>{row.title}</Text>
              {row.statement ? <Text style={styles.statement}>{row.statement}</Text> : null}

              <Text style={styles.meta}>
                {row.frequency ? `Plan calls for: ${row.frequency}` : 'No frequency set'}
                {row.lastAddressed
                  ? `  ·  Last worked on ${formatServiceDate(row.lastAddressed)}`
                  : '  ·  Not yet worked on'}
                {outcome?.targetDate ? `  ·  Target ${formatServiceDate(outcome.targetDate)}` : ''}
              </Text>

              <View style={styles.counts}>
                <View style={styles.count}>
                  <Text style={styles.countNumber}>{row.timesAddressed}</Text>
                  <Text style={styles.countLabel}>Addressed</Text>
                </View>
                <View style={styles.count}>
                  <Text style={styles.countNumber}>{rate}%</Text>
                  <Text style={styles.countLabel}>Of shifts recorded</Text>
                </View>
                <View style={styles.count}>
                  <Text style={styles.countNumber}>{row.progressed}</Text>
                  <Text style={styles.countLabel}>Progressed</Text>
                </View>
                <View style={styles.count}>
                  <Text style={styles.countNumber}>{row.maintained}</Text>
                  <Text style={styles.countLabel}>Maintained</Text>
                </View>
                <View style={styles.count}>
                  <Text style={styles.countNumber}>{row.regressed}</Text>
                  <Text style={styles.countLabel}>Lost ground</Text>
                </View>
                <View style={styles.count}>
                  <Text style={styles.countNumber}>{row.declined}</Text>
                  <Text style={styles.countLabel}>Declined</Text>
                </View>
              </View>

              {neverAddressed ? (
                <Text style={styles.flag}>
                  Not worked on during this period — discuss at the review.
                </Text>
              ) : null}
              {losingGround ? (
                <Text style={styles.flag}>
                  More setbacks than progress this period — consider revising the approach.
                </Text>
              ) : null}
            </View>
          );
        })}

        <View style={styles.signatureBlock} wrap={false}>
          <View style={styles.signatureLine} />
          <Text style={styles.signatureLabel}>Reviewed by (signature)</Text>

          <View style={[styles.signatureLine, { marginTop: 18 }]} />
          <Text style={styles.signatureLabel}>Title and date</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Counted from signed notes only. Generated{' '}
            {formatServiceDate(generatedOn)} by {orgLine}.
          </Text>
          {footerLine ? <Text style={styles.footerText}>{footerLine}</Text> : null}
        </View>
      </Page>
    </Document>
  );
}
