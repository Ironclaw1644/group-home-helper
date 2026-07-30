import Link from 'next/link';
import { requireSession, orgTimeZone } from '@/lib/auth/session';
import { getRoster } from '@/lib/notes/repo';
import { AppShell } from '@/components/app-shell';
import { RosterList } from '@/components/note/roster-list';
import { EmptyState, PageHeader } from '@/components/ui';
import { addDays, formatServiceDate, todayInTimeZone } from '@/lib/utils';
import { displayName } from '@/lib/types';

export const dynamic = 'force-dynamic';

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

  // Resolve the display name server-side so the client list does not need to
  // know the preferred-name rule.
  const entries = roster.map((entry) => ({
    ...entry,
    displayName: displayName({
      firstName: entry.residentFirstName,
      preferredName: entry.residentPreferredName
    })
  }));

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
        <Link
          href={qs({ date: addDays(serviceDate, -1) })}
          className="text-xs font-semibold text-brand-slate hover:text-brand-navy"
        >
          ← Previous day
        </Link>
        {serviceDate !== today ? (
          <Link href={qs({ date: today })} className="text-xs font-semibold text-brand-teal hover:underline">
            Jump to today
          </Link>
        ) : null}
        {serviceDate < today ? (
          <Link
            href={qs({ date: addDays(serviceDate, 1) })}
            className="text-xs font-semibold text-brand-slate hover:text-brand-navy"
          >
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

      <RosterList entries={entries} homeId={home.id} serviceDate={serviceDate} />
    </AppShell>
  );
}
