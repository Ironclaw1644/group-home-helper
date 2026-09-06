import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { orgTimeZone } from '@/lib/auth/session';
import { addDays, todayInTimeZone } from '@/lib/utils';

/**
 * The things that get a provider cited, surfaced before they do.
 *
 * Every one of these is something a supervisor would otherwise learn from an
 * auditor: a service plan that expired last month, an outcome nobody has
 * documented in weeks, a consent that lapses on Friday. None of it is clever —
 * it is work nobody has time to do by hand across a full roster, every week,
 * forever.
 */

export type ComplianceAlert = {
  kind: 'document_expired' | 'document_expiring' | 'outcome_stale' | 'no_outcomes';
  severity: 'high' | 'medium';
  residentId: string | null;
  residentName: string;
  title: string;
  detail: string;
  href: string;
};

/** Documents expiring inside this window are worth flagging early. */
const EXPIRY_WARNING_DAYS = 45;

/**
 * An outcome with no documentation for this long is the first thing a support
 * coordinator asks about at a quarterly review.
 */
const STALE_OUTCOME_DAYS = 21;

export async function complianceAlerts(homeId?: string): Promise<ComplianceAlert[]> {
  const supabase = await createSupabaseServerClient();
  const alerts: ComplianceAlert[] = [];

  // Every window here is measured in the agency's own calendar. A document
  // that expires today is not expired yet in Los Angeles while the server has
  // already rolled over to tomorrow in UTC.
  const timeZone = await orgTimeZone();
  const today = todayInTimeZone(timeZone);
  const soon = addDays(today, EXPIRY_WARNING_DAYS);
  const staleBefore = addDays(today, -STALE_OUTCOME_DAYS);

  // RLS already limits this to homes the caller may see.
  let residentQuery = supabase
    .from('residents')
    .select('id, first_name, last_name, preferred_name')
    .eq('active', true)
    .eq('is_demo', false);
  if (homeId) residentQuery = residentQuery.eq('home_id', homeId);

  const { data: residents } = await residentQuery;
  const roster = residents ?? [];
  if (roster.length === 0) return alerts;

  const nameOf = (r: { first_name: string; last_name: string; preferred_name: string | null }) =>
    `${r.preferred_name?.trim() || r.first_name} ${r.last_name}`;

  const byId = new Map(
    roster.map((r) => [
      r.id as string,
      r as { first_name: string; last_name: string; preferred_name: string | null }
    ])
  );
  const ids = roster.map((r) => r.id as string);

  // --- Documents ----------------------------------------------------------
  const { data: docs } = await supabase
    .from('documents')
    .select('id, resident_id, title, kind, expires_on')
    .not('expires_on', 'is', null)
    .lte('expires_on', soon);

  for (const doc of docs ?? []) {
    const residentId = (doc.resident_id as string | null) ?? null;
    const resident = residentId ? byId.get(residentId) : null;
    if (residentId && !resident) continue;

    const expired = (doc.expires_on as string) < today;

    alerts.push({
      kind: expired ? 'document_expired' : 'document_expiring',
      severity: expired ? 'high' : 'medium',
      residentId,
      residentName: resident ? nameOf(resident) : 'Agency document',
      title: doc.title as string,
      detail: expired ? `Expired ${doc.expires_on}` : `Expires ${doc.expires_on}`,
      href: residentId ? `/residents/${residentId}/documents` : '/residents'
    });
  }

  // --- Outcomes -----------------------------------------------------------
  const { data: outcomes } = await supabase
    .from('resident_outcomes')
    .select('id, resident_id, title')
    .in('resident_id', ids)
    .eq('active', true);

  const outcomeList = outcomes ?? [];

  for (const id of ids) {
    if (outcomeList.some((o) => o.resident_id === id)) continue;
    const resident = byId.get(id);
    if (!resident) continue;

    alerts.push({
      kind: 'no_outcomes',
      severity: 'high',
      residentId: id,
      residentName: nameOf(resident),
      title: 'No service plan outcomes',
      detail: 'Notes cannot show progress toward a plan that is not in the system.',
      href: `/residents/${id}/outcomes`
    });
  }

  if (outcomeList.length > 0) {
    // One query for the whole roster rather than one per outcome: ten people
    // with six outcomes each would otherwise be sixty round trips to render
    // one card.
    const { data: recent } = await supabase
      .from('note_outcomes')
      .select('outcome_id, addressed, notes!inner(service_date, status)')
      .in(
        'outcome_id',
        outcomeList.map((o) => o.id as string)
      )
      .eq('addressed', true)
      .eq('notes.status', 'signed')
      .gte('notes.service_date', staleBefore);

    const workedRecently = new Set((recent ?? []).map((r) => r.outcome_id as string));

    for (const outcome of outcomeList) {
      if (workedRecently.has(outcome.id as string)) continue;
      const resident = byId.get(outcome.resident_id as string);
      if (!resident) continue;

      alerts.push({
        kind: 'outcome_stale',
        severity: 'medium',
        residentId: outcome.resident_id as string,
        residentName: nameOf(resident),
        title: outcome.title as string,
        detail: `No signed documentation in ${STALE_OUTCOME_DAYS} days`,
        href: `/residents/${outcome.resident_id}/progress`
      });
    }
  }

  // High severity first, then alphabetical so the list is stable between loads
  // rather than reshuffling as data changes.
  return alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'high' ? -1 : 1;
    return a.residentName.localeCompare(b.residentName);
  });
}
