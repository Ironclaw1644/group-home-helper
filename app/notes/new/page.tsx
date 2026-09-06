import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, CalendarDays, Check, PenLine } from 'lucide-react';
import { requireSession, orgTimeZone } from '@/lib/auth/session';
import { getOrCreateNote, getResident, getRoster } from '@/lib/notes/repo';
import { AppShell } from '@/components/app-shell';
import { Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { displayName } from '@/lib/types';
import { formatServiceDate, todayInTimeZone } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Write a note.
 *
 * Two jobs in one route. Given a resident, shift and date it opens that note,
 * creating an empty draft the first time — get-or-create is keyed on those
 * three, so following the link twice reopens the same note rather than making
 * a second one.
 *
 * Without them it asks. That case used to redirect to the home page, which
 * meant that on a day where every note happened to be written there was no way
 * to write one at all: the home page only ever linked to notes it considered
 * missing, so the button vanished and this route bounced you back to it.
 * Writing a note is the whole point of the app, so it has to work from a
 * standing start — any resident, any shift, any day.
 */
export default async function NewNotePage({
  searchParams
}: {
  searchParams: Promise<{ resident?: string; shift?: string; date?: string; home?: string }>;
}) {
  const session = await requireSession();
  const { resident: residentId, shift: shiftId, date, home: homeParam } = await searchParams;

  const tz = await orgTimeZone();
  const today = todayInTimeZone(tz);
  const serviceDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;

  // ---- Direct link: open the note ----------------------------------------
  if (residentId && shiftId && homeParam) {
    // RLS scopes this read, so a resident outside the caller's homes comes back
    // null rather than being silently created against.
    const resident = await getResident(residentId);
    if (resident && resident.homeId === homeParam) {
      const note = await getOrCreateNote({
        orgId: session.profile.orgId,
        homeId: homeParam,
        residentId,
        shiftId,
        serviceDate,
        authorId: session.profile.id
      });
      redirect(`/notes/${note.id}`);
    }
    // Anything that does not line up falls through to the picker below, rather
    // than dumping the person back on the home page with no explanation.
  }

  // ---- Otherwise: ask ----------------------------------------------------
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

  const home = session.homes.find((h) => h.id === homeParam) ?? session.homes[0];
  const roster = await getRoster(home.id, serviceDate);

  // Grouped by resident, because that is the order staff think in: pick the
  // person, then the shift.
  const byResident = new Map<string, typeof roster>();
  for (const entry of roster) {
    const list = byResident.get(entry.residentId) ?? [];
    list.push(entry);
    byResident.set(entry.residentId, list);
  }

  const linkFor = (entry: (typeof roster)[number]) =>
    `/notes/new?${new URLSearchParams({
      resident: entry.residentId,
      shift: entry.shiftId,
      date: serviceDate,
      home: home.id
    }).toString()}`;

  return (
    <AppShell session={session}>
      <PageHeader
        title="Write a note"
        subtitle="Pick who the note is about and which shift it covers."
      />

      {/* A plain GET form: no JavaScript needed, and the choice stays in the
          URL, so a particular day can be bookmarked or sent to someone. */}
      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="date"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-slate"
            >
              Service date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={serviceDate}
              max={today}
              className="rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
            />
          </div>

          {session.homes.length > 1 ? (
            <div>
              <label
                htmlFor="home"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-brand-slate"
              >
                House
              </label>
              <select
                id="home"
                name="home"
                defaultValue={home.id}
                className="rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
              >
                {session.homes.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="home" value={home.id} />
          )}

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-navy/15 bg-white px-4 py-2.5 text-sm font-semibold text-brand-navy hover:bg-brand-sand"
          >
            <CalendarDays className="h-4 w-4" />
            Show
          </button>

          <p className="w-full text-xs text-brand-slate">
            {serviceDate === today
              ? 'Today. Change the date to write up an earlier shift.'
              : formatServiceDate(serviceDate)}
          </p>
        </form>
      </Card>

      {byResident.size === 0 ? (
        <Card className="text-center">
          <p className="font-semibold text-brand-navy">No residents on this house yet</p>
          <p className="mt-1 text-sm text-brand-slate">
            Add the people living here and their shifts appear here to write up.
          </p>
          <div className="mt-4">
            <Button href="/residents/new">Add a resident</Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...byResident.entries()].map(([id, shifts]) => {
            const first = shifts[0];
            const name = displayName({
              firstName: first.residentFirstName,
              preferredName: first.residentPreferredName
            });

            return (
              <Card key={id}>
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-semibold text-brand-navy">
                    {name}
                    {first.residentRoom ? (
                      <span className="ml-2 text-xs font-normal text-brand-slate">
                        Room {first.residentRoom}
                      </span>
                    ) : null}
                  </h2>
                  <Link
                    href={`/residents/${id}/outcomes`}
                    className="shrink-0 text-xs font-semibold text-brand-teal hover:underline"
                  >
                    Service plan
                  </Link>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {[...shifts]
                    .sort((a, b) => a.shiftSort - b.shiftSort)
                    .map((entry) => (
                      <Link
                        key={entry.shiftId}
                        href={linkFor(entry)}
                        className="group flex items-center justify-between gap-3 rounded-xl border border-brand-navy/10 bg-white px-3 py-3 transition hover:border-brand-teal hover:bg-brand-sand/50"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-brand-navy">
                            {entry.shiftLabel}
                          </span>
                          <span className="block text-xs text-brand-slate">
                            {entry.noteStatus === 'signed'
                              ? 'Signed — opens the record'
                              : entry.noteStatus === 'draft'
                                ? 'Draft — pick up where you left off'
                                : 'Not started'}
                          </span>
                        </span>
                        {entry.noteStatus === 'signed' ? (
                          <Check className="h-4 w-4 shrink-0 text-status-signed" />
                        ) : entry.noteStatus === 'draft' ? (
                          <PenLine className="h-4 w-4 shrink-0 text-status-draft" />
                        ) : (
                          <ArrowRight className="h-4 w-4 shrink-0 text-brand-slate group-hover:text-brand-teal" />
                        )}
                      </Link>
                    ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
