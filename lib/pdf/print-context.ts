import { formatServiceDate } from '@/lib/utils';
import { PRINT_SOURCES } from '@/lib/types';
import type { Note, PrintContext, PrintSource, Resident, Shift } from '@/lib/types';

/**
 * Resolve the values a printed form is allowed to draw on.
 *
 * The renderer knows how to draw a labelled blank. It does not know what
 * "Medicaid identification number of individual receiving service" means, or
 * that Ohio asks for it and Virginia writes it as "Medicaid". That mapping is
 * the template's job; this module's job is to make sure that whatever the
 * template asks for, there is exactly one place the value came from.
 *
 * Two rules hold here and are worth keeping:
 *
 *   1. **A missing value is a blank, not a placeholder.** An unfilled field on
 *      a paper form is a blank line; a reviewer reads that correctly. Printing
 *      "N/A" or "unknown" would be the app making a statement nobody made.
 *
 *   2. **Nothing is borrowed.** There is no fallback chain that reaches for a
 *      different resident, a different org, or a default agency. Every value
 *      below comes from the arguments and from nowhere else.
 */

export type PrintContextInput = {
  note: Note;
  resident: Resident;
  /** The shift this note covers, when the caller could resolve it. */
  shift?: Pick<Shift, 'label'> & { startTime?: string | null; endTime?: string | null };
  /** Falls back to `shift.label` for callers that only have the label. */
  shiftLabel?: string;
  /** The agency legal name, from lib/branding/print.ts. Never a constant. */
  orgLine: string;
  /** `ghh.organizations.medicaid_provider_id`. */
  providerId?: string | null;
  /** Where the service was delivered — the home's name, or name + address. */
  placeOfService?: string | null;
  /**
   * What service this note documents, in the jurisdiction's own words
   * (Ohio: "Homemaker/Personal Care"). Comes from the template, not from here.
   */
  serviceType?: string | null;
  /**
   * How many people shared the service at this site on this shift.
   *
   * Ohio asks for it explicitly. It is only ever printed when the caller
   * actually counted; there is no default of "1", because a form that asserts
   * a group size nobody measured is a billing claim the app invented.
   */
  groupSize?: number | null;
};

/** Trim to a single line and cap it, so no field can push the page around. */
function line(value: unknown, max = 200): string {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** '19:00:00' → '7:00 PM'. Returns '' for anything unparseable. */
export function formatClock(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return '';
  const hours = Number(m[1]);
  const minutes = m[2];
  if (!Number.isFinite(hours) || hours > 23) return '';
  const suffix = hours < 12 ? 'AM' : 'PM';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${minutes} ${suffix}`;
}

export function buildPrintContext(input: PrintContextInput): PrintContext {
  const { note, resident } = input;

  // "Individual's Name" is the identity field on a Medicaid document. It
  // carries the legal name whatever the house calls them day to day — the
  // preferred name is a separate source a template may also ask for.
  const legalName = line(`${resident.firstName} ${resident.lastName}`);
  const preferred = line(resident.preferredName?.trim() || resident.firstName);
  const shiftLabel = line(input.shiftLabel ?? input.shift?.label ?? '');

  return {
    resident_legal_name: legalName,
    resident_preferred_name: preferred,
    medicaid_id: line(resident.medicaidId ?? ''),
    service_date: formatServiceDate(note.serviceDate),
    shift_label: shiftLabel,
    shift_start: formatClock(input.shift?.startTime),
    shift_stop: formatClock(input.shift?.endTime),
    org_line: line(input.orgLine, 160),
    provider_id: line(input.providerId ?? ''),
    place_of_service: line(input.placeOfService ?? ''),
    service_type: line(input.serviceType ?? ''),
    // Explicitly not defaulted. See the field comment above.
    group_size: typeof input.groupSize === 'number' ? String(input.groupSize) : '',
    signature_name: line(note.signatureName ?? ''),
    signature_title: line(note.signatureTitle ?? '')
  };
}

/**
 * Read one source out of a context.
 *
 * A template row is data, and data can be wrong — a typo'd source name must
 * print a blank rather than "undefined" or crash the export of a month of
 * signed notes.
 */
export function readSource(ctx: PrintContext, source: string): string {
  return (PRINT_SOURCES as readonly string[]).includes(source)
    ? ctx[source as PrintSource]
    : '';
}
