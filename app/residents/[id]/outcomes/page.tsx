import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { requireSupervisor } from '@/lib/auth/session';
import { getResident } from '@/lib/residents/repo';
import { listActivities, listOutcomes } from '@/lib/outcomes/repo';
import { AppShell } from '@/components/app-shell';
import { OutcomeManager } from '@/components/outcomes/outcome-manager';
import { LibraryPicker } from '@/components/outcomes/library-picker';
import { Card, PageHeader } from '@/components/ui';
import { displayName } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function OutcomesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSupervisor();
  const { id } = await params;

  const resident = await getResident(id);
  if (!resident) notFound();

  // Retired outcomes are shown too: a supervisor reviewing a plan needs to see
  // what was dropped and when, not just what is current.
  const outcomes = await listOutcomes(id, true);
  const activities = await listActivities(outcomes.map((o) => o.id));
  const known = displayName(resident);

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
        title="Service plan"
        subtitle={`${known} ${resident.lastName} · what staff document against every shift`}
      />

      {/* This page and the daily note are one workflow, and reading them as two
          separate features is the most common way to misunderstand the app: a
          plan built here is not paperwork filed away, it is the checklist that
          appears inside every note written about this person. Say so, and put
          the next step within reach instead of making people navigate back. */}
      <Card className="mb-4 border-brand-teal/30 bg-brand-aqua/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-xl text-xs text-brand-slate">
            <span className="font-semibold text-brand-navy">
              Everything on this page shows up inside {known}&apos;s daily notes.
            </span>{' '}
            Each outcome becomes a section staff fill in on the shift — what was worked on, how
            much support it took, and how it went. That is what turns a note into evidence of
            progress, and what the quarterly review counts.
          </p>
          <Link
            href={`/notes/new?resident=${id}&home=${resident.homeId}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-navy/90"
          >
            <Sparkles className="h-4 w-4" />
            Write {known}&apos;s note
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Card>

      {outcomes.length === 0 ? (
        <div className="mb-4">
          <LibraryPicker residentId={id} residentName={known} />
        </div>
      ) : null}

      <OutcomeManager
        residentId={id}
        residentName={known}
        outcomes={outcomes}
        activities={activities}
      />
    </AppShell>
  );
}
