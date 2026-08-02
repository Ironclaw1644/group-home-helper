import Link from 'next/link';
import { FileBarChart, FileDown, FolderOpen, Target, TrendingUp } from 'lucide-react';
import { requireSession, isSupervisor } from '@/lib/auth/session';
import { listResidents } from '@/lib/residents/repo';
import { AppShell } from '@/components/app-shell';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { displayName } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Everything printable, in one place.
 *
 * These existed already but only from inside a single resident, which meant the
 * quarterly review — the thing that replaces a weekend of counting — was
 * invisible unless you already knew where to look.
 */
export default async function ReportsPage({
  searchParams
}: {
  searchParams: Promise<{ home?: string }>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  if (session.homes.length === 0) {
    return (
      <AppShell session={session}>
        <EmptyState title="No home assigned yet" body="Ask a supervisor to add you to a house." />
      </AppShell>
    );
  }

  const home = session.homes.find((h) => h.id === params.home) ?? session.homes[0];
  const residents = await listResidents({ homeId: home.id, status: 'active' });
  const supervisor = isSupervisor(session.profile);

  const today = new Date().toISOString().slice(0, 10);
  const quarterAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  return (
    <AppShell session={session}>
      <PageHeader title="Reports" subtitle={`${home.name} · everything printable`} />

      {supervisor ? (
        <Card className="mb-5">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-navy">
            <FileDown className="h-4 w-4 text-brand-teal" />
            Notes for a date range
          </h2>
          <p className="mb-3 text-xs text-brand-slate">
            Every signed note across the house as one merged PDF — what you hand an auditor, or
            attach to a billing packet.
          </p>
          <Link
            href="/supervisor"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy/90"
          >
            Open the export
          </Link>
        </Card>
      ) : null}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
        Per resident
      </h2>

      {residents.length === 0 ? (
        <EmptyState
          title="No residents yet"
          body="Add someone to the roster and their reports appear here."
        />
      ) : (
        <div className="space-y-2">
          {residents.map((r) => {
            const known = displayName(r);
            return (
              <Card key={r.id} className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-brand-navy">
                    {known} {r.lastName}
                  </span>
                  {r.room ? <Badge tone="neutral">Room {r.room}</Badge> : null}
                  {r.isDemo ? <Badge tone="info">Training</Badge> : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/residents/${r.id}/progress/pdf?from=${quarterAgo}&to=${today}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brand-navy px-3 py-2 text-xs font-semibold text-white hover:bg-brand-navy/90"
                  >
                    <FileBarChart className="h-3.5 w-3.5" />
                    Quarterly review PDF
                  </Link>
                  <Link
                    href={`/residents/${r.id}/progress`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy hover:bg-brand-sand"
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    Progress
                  </Link>
                  <Link
                    href={`/residents/${r.id}/documents`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy hover:bg-brand-sand"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Documents
                  </Link>
                  {supervisor ? (
                    <Link
                      href={`/residents/${r.id}/outcomes`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy hover:bg-brand-sand"
                    >
                      <Target className="h-3.5 w-3.5" />
                      Service plan
                    </Link>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
