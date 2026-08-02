import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, ArrowLeft, FileDown, TrendingUp } from 'lucide-react';
import { requireSession } from '@/lib/auth/session';
import { getResident } from '@/lib/residents/repo';
import { listOutcomes, outcomeProgress } from '@/lib/outcomes/repo';
import { AppShell } from '@/components/app-shell';
import { Alert, Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { displayName } from '@/lib/types';
import { formatServiceDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Progress toward the plan, over a date range.
 *
 * Defaults to the last 90 days because that is the review cycle a Virginia
 * support coordinator works on. The two flags below are the things a reviewer
 * looks for, surfaced rather than left to be spotted by reading every note.
 */
export default async function ProgressPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const q = await searchParams;

  const resident = await getResident(id);
  if (!resident) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const ninety = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from ?? '') ? q.from! : ninety;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to ?? '') ? q.to! : today;

  const [outcomes, progress] = await Promise.all([
    listOutcomes(id, true),
    outcomeProgress(id, from, to)
  ]);

  const known = displayName(resident);
  const neverWorked = progress.filter((p) => p.timesAddressed === 0);
  const slipping = progress.filter(
    (p) => p.timesAddressed > 0 && p.regressed + p.declined > p.progressed
  );

  const range = (days: number) => {
    const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return `/residents/${id}/progress?from=${start}&to=${today}`;
  };

  return (
    <AppShell session={session}>
      <Link
        href={`/residents/${id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-brand-navy"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {known}
      </Link>

      <PageHeader
        title="Progress"
        subtitle={`${formatServiceDate(from)} to ${formatServiceDate(to)} · signed notes only`}
        actions={
          <Button href={`/residents/${id}/progress/pdf?from=${from}&to=${to}`} size="sm">
            <FileDown className="h-4 w-4" />
            Quarterly review PDF
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { days: 30, label: 'Last 30 days' },
          { days: 90, label: 'Last quarter' },
          { days: 365, label: 'Last year' }
        ].map((r) => (
          <Link
            key={r.days}
            href={range(r.days)}
            className="rounded-full border border-brand-navy/15 bg-white px-3 py-1.5 text-xs font-semibold text-brand-slate hover:text-brand-navy"
          >
            {r.label}
          </Link>
        ))}
      </div>

      {neverWorked.length > 0 ? (
        <div className="mb-4">
          <Alert tone="warning" title={`${neverWorked.length} not worked on this period`}>
            <p>
              {neverWorked.map((p) => p.title).join(', ')} — an outcome with no documentation over a
              review period is the first thing a support coordinator asks about.
            </p>
          </Alert>
        </div>
      ) : null}

      {slipping.length > 0 ? (
        <div className="mb-4">
          <Alert tone="warning" title="More setbacks than progress">
            <p>
              {slipping.map((p) => p.title).join(', ')} — worth revisiting the approach at the next
              review rather than at the annual.
            </p>
          </Alert>
        </div>
      ) : null}

      {progress.length === 0 ? (
        <EmptyState
          title="No outcomes in the plan yet"
          body={`Add ${known}'s service plan outcomes and this fills in as notes are signed.`}
        />
      ) : (
        <div className="space-y-3">
          {progress.map((p) => {
            const outcome = outcomes.find((o) => o.id === p.outcomeId);
            const total = p.timesAddressed + p.timesNotAddressed;
            const rate = total > 0 ? Math.round((p.timesAddressed / total) * 100) : 0;

            return (
              <Card key={p.outcomeId}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <TrendingUp className="h-4 w-4 shrink-0 text-brand-teal" />
                  <h2 className="text-sm font-semibold text-brand-navy">{p.title}</h2>
                  {p.timesAddressed === 0 ? (
                    <Badge tone="missing">Not worked on</Badge>
                  ) : (
                    <Badge tone="signed">{rate}% of shifts</Badge>
                  )}
                  {outcome && !outcome.active ? <Badge tone="neutral">Retired</Badge> : null}
                </div>

                {p.statement ? (
                  <p className="mb-3 ml-6 text-sm text-brand-slate">{p.statement}</p>
                ) : null}

                <div className="ml-6 flex flex-wrap gap-x-6 gap-y-2">
                  {[
                    { n: p.timesAddressed, label: 'Addressed' },
                    { n: p.progressed, label: 'Progressed' },
                    { n: p.maintained, label: 'Maintained' },
                    { n: p.regressed, label: 'Lost ground' },
                    { n: p.declined, label: 'Declined' }
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="text-lg font-semibold text-brand-navy">{s.n}</p>
                      <p className="text-xs text-brand-slate">{s.label}</p>
                    </div>
                  ))}
                </div>

                <p className="ml-6 mt-3 text-xs text-brand-slate">
                  {p.frequency ? `Plan calls for ${p.frequency}. ` : ''}
                  {p.lastAddressed
                    ? `Last worked on ${formatServiceDate(p.lastAddressed)}.`
                    : 'No documentation in this period.'}
                </p>

                {p.regressed + p.declined > p.progressed && p.timesAddressed > 0 ? (
                  <p className="ml-6 mt-2 inline-flex items-center gap-1 text-xs font-semibold text-status-draft">
                    <AlertTriangle className="h-3 w-3" />
                    More setbacks than progress
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
