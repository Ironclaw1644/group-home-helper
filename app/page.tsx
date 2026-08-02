import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { requireSession, orgTimeZone, isSupervisor } from '@/lib/auth/session';
import { getRoster } from '@/lib/notes/repo';
import { complianceAlerts } from '@/lib/compliance/checks';
import { AppShell } from '@/components/app-shell';
import { RosterList } from '@/components/note/roster-list';
import { QuickActions } from '@/components/home/quick-actions';
import { SetupChecklist, type SetupState } from '@/components/home/setup-checklist';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ComplianceAlertsCard } from '@/components/compliance/alerts-card';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { addDays, formatServiceDate, todayInTimeZone } from '@/lib/utils';
import { displayName } from '@/lib/types';

export const dynamic = 'force-dynamic';

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ home?: string; date?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const tz = orgTimeZone();
  const today = todayInTimeZone(tz);
  const serviceDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const supervisor = isSupervisor(session.profile);

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

  const entries = roster.map((entry) => ({
    ...entry,
    displayName: displayName({
      firstName: entry.residentFirstName,
      preferredName: entry.residentPreferredName
    })
  }));

  const missing = roster.filter((r) => !r.noteStatus);
  const drafts = roster.filter((r) => r.noteStatus === 'draft');
  const signed = roster.filter((r) => r.noteStatus === 'signed');

  // Supervisors see what would get the agency cited; a DSP does not need it and
  // it would only bury the shift they are here to document.
  const alerts = supervisor ? await complianceAlerts(home.id) : [];

  // Setup progress, so a new agency is never left staring at an empty roster
  // wondering what to do first. Supervisors only — a DSP cannot action any of
  // it, and it would only be noise on their shift.
  let setup: SetupState | null = null;
  if (supervisor) {
    const supabase = await createSupabaseServerClient();
    const countOf = async (table: string) => {
      const { count } = await supabase.from(table).select('id', { count: 'exact', head: true });
      return count ?? 0;
    };

    const [residentCount, outcomeCount, staffCount, signedCount, org] = await Promise.all([
      countOf('residents'),
      countOf('resident_outcomes'),
      countOf('profiles'),
      supabase
        .from('notes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'signed')
        .then((r) => r.count ?? 0),
      supabase
        .from('organizations')
        .select('branding')
        .eq('id', session.profile.orgId)
        .maybeSingle()
    ]);

    const branding = (org.data?.branding ?? {}) as Record<string, unknown>;

    setup = {
      hasResidents: residentCount > 0,
      hasOutcomes: outcomeCount > 0,
      // More than just the founder means someone has actually been invited.
      hasStaff: staffCount > 1,
      hasSignedNote: signedCount > 0,
      hasBranding: Boolean(branding.logo_url)
    };
  }

  // Deep-link the primary button straight into the next note that needs
  // writing, so the most common action is one tap from opening the app.
  const next = missing[0];
  const nextHref = next
    ? `/notes/new?${new URLSearchParams({
        resident: next.residentId,
        shift: next.shiftId,
        date: serviceDate,
        home: home.id
      }).toString()}`
    : null;

  const firstName = session.profile.fullName.split(' ')[0];
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(
      new Date()
    )
  );

  const qs = (overrides: Record<string, string>) =>
    `/?${new URLSearchParams({ home: home.id, date: serviceDate, ...overrides }).toString()}`;

  return (
    <AppShell session={session}>
      <PageHeader
        title={`${greeting(hour)}, ${firstName}`}
        subtitle={`${home.name} · ${serviceDate === today ? 'Today' : formatServiceDate(serviceDate)}`}
      />

      {/* The one thing to do right now, stated plainly and made tappable. */}
      {nextHref ? (
        <Card className="mb-6 border-brand-teal/40 bg-brand-aqua/15">
          <p className="text-sm font-semibold text-brand-navy">
            {missing.length} {missing.length === 1 ? 'note' : 'notes'} still to write
          </p>
          <p className="mt-1 text-xs text-brand-slate">
            A shift without a signed note cannot be billed, and the resident has no record of their
            care that day.
          </p>
          <Link
            href={nextHref}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-navy/90"
          >
            <Sparkles className="h-4 w-4" />
            Start {entries.find((e) => e.residentId === next.residentId)?.displayName}&apos;s note
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      ) : roster.length > 0 ? (
        <Card className="mb-6 border-status-signed/30 bg-status-signed/10">
          <p className="text-sm font-semibold text-brand-navy">
            Every note for {serviceDate === today ? 'today' : 'this day'} is written
          </p>
          <p className="mt-1 text-xs text-brand-slate">
            {signed.length} signed{drafts.length > 0 ? `, ${drafts.length} still in draft` : ''}.
          </p>
        </Card>
      ) : null}

      {setup ? <SetupChecklist state={setup} /> : null}

      {supervisor ? <ComplianceAlertsCard alerts={alerts} /> : null}

      <QuickActions role={session.profile.role} />

      <section>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
            {serviceDate === today ? "Today's shifts" : formatServiceDate(serviceDate)}
          </h2>

          <div className="ml-auto flex items-center gap-3">
            <Link
              href={qs({ date: addDays(serviceDate, -1) })}
              className="text-xs font-semibold text-brand-slate hover:text-brand-navy"
            >
              ← Previous
            </Link>
            {serviceDate !== today ? (
              <Link href={qs({ date: today })} className="text-xs font-semibold text-brand-teal hover:underline">
                Today
              </Link>
            ) : null}
            {serviceDate < today ? (
              <Link
                href={qs({ date: addDays(serviceDate, 1) })}
                className="text-xs font-semibold text-brand-slate hover:text-brand-navy"
              >
                Next →
              </Link>
            ) : null}
          </div>
        </div>

        {session.homes.length > 1 ? (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
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

        <RosterList entries={entries} homeId={home.id} serviceDate={serviceDate} />
      </section>
    </AppShell>
  );
}
