import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireSupervisor } from '@/lib/auth/session';
import { getResident } from '@/lib/residents/repo';
import { listActivities, listOutcomes } from '@/lib/outcomes/repo';
import { AppShell } from '@/components/app-shell';
import { OutcomeManager } from '@/components/outcomes/outcome-manager';
import { LibraryPicker } from '@/components/outcomes/library-picker';
import { PageHeader } from '@/components/ui';
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
