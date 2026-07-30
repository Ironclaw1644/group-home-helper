import Link from 'next/link';
import { ChevronRight, CircleAlert, CircleCheck, CircleDot, Plus } from 'lucide-react';
import { requireSession, orgTimeZone } from '@/lib/auth/session';
import { getRoster } from '@/lib/notes/repo';
import { AppShell } from '@/components/app-shell';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { addDays, formatServiceDate, todayInTimeZone } from '@/lib/utils';
import type { RosterEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';

function statusFor(entry: RosterEntry) {
  if (entry.noteStatus === 'signed') {
    return { tone: 'signed' as const, label: 'Signed', Icon: CircleCheck };
  }
  if (entry.noteStatus === 'draft') {
    return { tone: 'draft' as const, label: 'Draft', Icon: CircleDot };
  }
  return { tone: 'missing' as const, label: 'Not started', Icon: CircleAlert };
}

export default async function RosterPage({
  searchParams
}: {
  searchParams: Promise<{ home?: string; date?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const tz = orgTimeZone();
  const today = todayInTimeZone(tz);
  const serviceDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;

  if (session.homes.length === 0) {
    return (
      <AppShell session={session}>
        <EmptyState
          title="No home assigned yet"
          body="Your account is active but has not been assigned to a house. Ask a supervisor to add you."
        />
      </AppShell>
    );
  }

  const home = session.homes.find((h) => h.id === params.home) ?? session.homes[0];
  const roster = await getRoster(home.id, serviceDate);

  // Group by resident so each row shows every shift for that person.
  const byResident = new Map<string, RosterEntry[]>();
  for (const entry of roster) {
    const list = byResident.get(entry.residentId) ?? [];
    list.push(entry);
    byResident.set(entry.residentId, list);
  }

  const missingCount = roster.filter((r) => !r.noteStatus).length;
  const qs = (overrides: Record<string, string>) =>
    `/?${new URLSearchParams({ home: home.id, date: serviceDate, ...overrides }).toString()}`;

  return (
    <AppShell session={session}>
      <PageHeader
        title={serviceDate === today ? 'Today' : formatServiceDate(serviceDate)}
        subtitle={`${home.name} · ${formatServiceDate(serviceDate)}`}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={qs({ date: addDays(serviceDate, -1) })} className="text-xs font-semibold text-brand-slate hover:text-brand-navy">
          ← Previous day
        </Link>
        {serviceDate !== today ? (
          <Link href={qs({ date: today })} className="text-xs font-semibold text-brand-teal hover:underline">
            Jump to today
          </Link>
        ) : null}
        {serviceDate < today ? (
          <Link href={qs({ date: addDays(serviceDate, 1) })} className="text-xs font-semibold text-brand-slate hover:text-brand-navy">
            Next day →
          </Link>
        ) : null}

        {session.homes.length > 1 ? (
          <div className="ml-auto flex items-center gap-1.5">
            {session.homes.map((h) => (
              <Link
                key={h.id}
                href={`/?${new URLSearchParams({ home: h.id, date: serviceDate }).toString()}`}
                className={
                  h.id === home.id
                    ? 'rounded-full bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white'
                    : 'rounded-full border border-brand-navy/15 bg-white px-3 py-1.5 text-xs font-semibold text-brand-slate hover:text-brand-navy'
                }
              >
                {h.name}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {missingCount > 0 ? (
        <div className="mb-4 rounded-xl border border-status-missing/25 bg-status-missing/10 px-4 py-3 text-sm text-status-missing">
          <span className="font-semibold">
            {missingCount} {missingCount === 1 ? 'note' : 'notes'} not started
          </span>{' '}
          for this day. A shift without a signed note cannot be billed.
        </div>
      ) : null}

      {byResident.size === 0 ? (
        <EmptyState title="No residents in this house yet" body="Ask a supervisor to add residents." />
      ) : (
        <div className="space-y-3">
          {[...byResident.entries()].map(([residentId, entries]) => {
            const first = entries[0];
            return (
              <Card key={residentId} className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-base font-semibold text-brand-navy">
                    {first.residentFirstName} {first.residentLastName}
                  </h2>
                  {first.isDemo ? <Badge tone="info">Training</Badge> : null}
                </div>

                <ul className="space-y-2">
                  {entries
                    .slice()
                    .sort((a, b) => a.shiftSort - b.shiftSort)
                    .map((entry) => {
                      const { tone, label, Icon } = statusFor(entry);
                      const href = entry.noteId
                        ? `/notes/${entry.noteId}`
                        : `/notes/new?${new URLSearchParams({
                            resident: entry.residentId,
                            shift: entry.shiftId,
                            date: serviceDate,
                            home: home.id
                          }).toString()}`;

                      return (
                        <li key={entry.shiftId}>
                          <Link
                            href={href}
                            className="flex items-center gap-3 rounded-xl border border-brand-navy/10 bg-white px-3 py-3 transition hover:border-brand-teal/40 hover:bg-brand-sand/60"
                          >
                            <Icon
                              className={
                                tone === 'signed'
                                  ? 'h-5 w-5 shrink-0 text-status-signed'
                                  : tone === 'draft'
                                    ? 'h-5 w-5 shrink-0 text-status-draft'
                                    : 'h-5 w-5 shrink-0 text-status-missing'
                              }
                            />
                            <span className="text-sm font-semibold text-brand-navy">{entry.shiftLabel}</span>
                            <span className="ml-auto flex items-center gap-2">
                              <Badge tone={tone}>{label}</Badge>
                              {entry.noteId ? (
                                <ChevronRight className="h-4 w-4 text-brand-slate" />
                              ) : (
                                <Plus className="h-4 w-4 text-brand-slate" />
                              )}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
