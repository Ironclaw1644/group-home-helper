import Link from 'next/link';
import { CircleAlert, CircleCheck, CircleDot, Copy, FileDown } from 'lucide-react';
import { orgTimeZone, requireSupervisor } from '@/lib/auth/session';
import { getRoster } from '@/lib/notes/repo';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { complianceAlerts } from '@/lib/compliance/checks';
import { ComplianceAlertsCard } from '@/components/compliance/alerts-card';
import { addDays, formatServiceDate, todayInTimeZone } from '@/lib/utils';
import { DUPLICATE_WARN_THRESHOLD } from '@/lib/notes/similarity';
import ExportPanel from './export-panel';
import PrestagePanel from './prestage-panel';
import type { RosterEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function SupervisorPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSupervisor();
  const params = await searchParams;

  const tz = await orgTimeZone();
  const today = todayInTimeZone(tz);
  const serviceDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;

  // Supervisors see every home in the org, so this covers the whole agency.
  // What would get the agency cited, ahead of today's grid.
  const alerts = await complianceAlerts();

  const rosters = await Promise.all(
    session.homes.map(async (home) => ({
      home,
      entries: await getRoster(home.id, serviceDate)
    }))
  );

  const all = rosters.flatMap((r) => r.entries);
  const missing = all.filter((e) => !e.noteStatus).length;
  const drafts = all.filter((e) => e.noteStatus === 'draft').length;
  const signed = all.filter((e) => e.noteStatus === 'signed').length;

  // Notes flagged as near-copies of the previous day. This is the report an
  // auditor's findings would otherwise produce for you, months later.
  const supabase = await createSupabaseServerClient();
  const { data: duplicateRows } = await supabase
    .from('notes')
    .select('id, resident_id, service_date, similarity_prev')
    .gte('similarity_prev', DUPLICATE_WARN_THRESHOLD)
    .gte('service_date', addDays(serviceDate, -30))
    .lte('service_date', serviceDate)
    .order('service_date', { ascending: false })
    .limit(25);

  return (
    <AppShell session={session}>
      <PageHeader
        title="Supervisor"
        subtitle={`${formatServiceDate(serviceDate)} · ${session.homes.length} ${
          session.homes.length === 1 ? 'house' : 'houses'
        }`}
      />

      <ComplianceAlertsCard alerts={alerts} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link
          href={`/supervisor?date=${addDays(serviceDate, -1)}`}
          className="text-xs font-semibold text-brand-slate hover:text-brand-navy"
        >
          ← Previous day
        </Link>
        {serviceDate !== today ? (
          <Link href="/supervisor" className="text-xs font-semibold text-brand-teal hover:underline">
            Jump to today
          </Link>
        ) : null}
        {serviceDate < today ? (
          <Link
            href={`/supervisor?date=${addDays(serviceDate, 1)}`}
            className="text-xs font-semibold text-brand-slate hover:text-brand-navy"
          >
            Next day →
          </Link>
        ) : null}
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        {/* "Unbillable" is a statement about a day that is over. Said about
            today it contradicts the roster directly underneath it, which
            correctly shows those same shifts as still open — a supervisor
            opening this at ten in the morning was told six notes were
            unbillable for work their staff were in the middle of doing. On
            today's date the only true statement is that the note is not
            written yet. */}
        <StatTile
          tone="missing"
          value={missing}
          label={missing === 1 ? 'note missing' : 'notes missing'}
          note={serviceDate < today ? 'unbillable' : 'not written yet'}
        />
        <StatTile tone="draft" value={drafts} label={drafts === 1 ? 'draft' : 'drafts'} note="unsigned" />
        <StatTile tone="signed" value={signed} label="signed" note="complete" />
      </div>

      {rosters.map(({ home, entries }) => (
        <div key={home.id} className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
            {home.name}
          </h2>

          {entries.length === 0 ? (
            <EmptyState title="No residents in this house" />
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-brand-navy/10 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-brand-slate">
                      Resident
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-brand-slate">
                      Shift
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-brand-slate">
                      Status
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <RosterRow key={`${entry.residentId}-${entry.shiftId}`} entry={entry} homeId={home.id} date={serviceDate} />
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      ))}

      {duplicateRows && duplicateRows.length > 0 ? (
        <Card className="mb-6 border-status-draft/30">
          <div className="mb-2 flex items-center gap-2">
            <Copy className="h-4 w-4 text-status-draft" />
            <h2 className="text-sm font-semibold text-brand-navy">
              Near-duplicate notes (last 30 days)
            </h2>
          </div>
          <p className="mb-3 text-xs text-brand-slate">
            These were signed despite closely matching the resident&apos;s previous note. Repeated
            copy-forward documentation is a common audit finding.
          </p>
          <ul className="space-y-1 text-sm">
            {duplicateRows.map((row) => (
              <li key={row.id}>
                <Link href={`/notes/${row.id}`} className="text-brand-teal hover:underline">
                  {formatServiceDate(row.service_date)} —{' '}
                  {Math.round(Number(row.similarity_prev) * 100)}% similar
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <PrestagePanel homes={session.homes} today={today} />

      <ExportPanel homes={session.homes} defaultDate={serviceDate} />
    </AppShell>
  );
}

function StatTile({
  tone,
  value,
  label,
  note
}: {
  tone: 'missing' | 'draft' | 'signed';
  value: number;
  label: string;
  note: string;
}) {
  const color =
    tone === 'missing'
      ? 'text-status-missing'
      : tone === 'draft'
        ? 'text-status-draft'
        : 'text-status-signed';
  return (
    <Card className="p-4">
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      <p className="text-xs font-semibold text-brand-navy">{label}</p>
      <p className="text-xs text-brand-slate">{note}</p>
    </Card>
  );
}

function RosterRow({ entry, homeId, date }: { entry: RosterEntry; homeId: string; date: string }) {
  const href = entry.noteId
    ? `/notes/${entry.noteId}`
    : `/notes/new?${new URLSearchParams({
        resident: entry.residentId,
        shift: entry.shiftId,
        date,
        home: homeId
      }).toString()}`;

  return (
    <tr className="border-b border-brand-navy/5 last:border-0">
      <td className="px-4 py-3">
        <span className="font-medium text-brand-navy">
          {entry.residentFirstName} {entry.residentLastName}
        </span>
        {entry.isDemo ? (
          <span className="ml-2">
            <Badge tone="info">Training</Badge>
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-brand-slate">{entry.shiftLabel}</td>
      <td className="px-4 py-3">
        {entry.noteStatus === 'signed' ? (
          <span className="inline-flex items-center gap-1.5 text-status-signed">
            <CircleCheck className="h-4 w-4" /> Signed
          </span>
        ) : entry.noteStatus === 'draft' ? (
          <span className="inline-flex items-center gap-1.5 text-status-draft">
            <CircleDot className="h-4 w-4" /> Draft
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-status-missing">
            <CircleAlert className="h-4 w-4" /> Not started
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Link href={href} className="text-xs font-semibold text-brand-teal hover:underline">
          {entry.noteStatus === 'signed' ? 'View' : 'Open'}
        </Link>
        {entry.noteStatus === 'signed' && entry.noteId ? (
          <Link
            href={`/notes/${entry.noteId}/pdf`}
            className="ml-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-slate hover:text-brand-navy"
          >
            <FileDown className="h-3.5 w-3.5" />
            PDF
          </Link>
        ) : null}
      </td>
    </tr>
  );
}
