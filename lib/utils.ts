import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Format a `YYYY-MM-DD` service date for display without going through
 * `new Date(str)`, which parses bare dates as UTC and can shift the day
 * backwards for anyone west of Greenwich. A note dated 06/01 must never
 * render as 05/31.
 */
export function formatServiceDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${m}/${d}/${y}`;
}

/** Today in the given IANA timezone as `YYYY-MM-DD`. */
export function todayInTimeZone(timeZone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(new Date());
}

/** Shift a `YYYY-MM-DD` string by whole days, staying in calendar space. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Mask a Medicaid ID for list views: last four only. */
export function maskMedicaidId(id: string | null | undefined): string {
  if (!id) return '—';
  const tail = id.slice(-4);
  return `••••${tail}`;
}
