import { requireSupervisor } from '@/lib/auth/session';
import { AppShell } from '@/components/app-shell';
import { ImportPanel } from '@/components/residents/import-panel';
import { EmptyState, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ImportResidentsPage({
  searchParams
}: {
  searchParams: Promise<{ home?: string }>;
}) {
  const session = await requireSupervisor();
  const params = await searchParams;

  if (session.homes.length === 0) {
    return (
      <AppShell session={session}>
        <EmptyState title="No home to import into" body="Create a house first." />
      </AppShell>
    );
  }

  const home = session.homes.find((h) => h.id === params.home) ?? session.homes[0];

  return (
    <AppShell session={session}>
      <PageHeader
        title="Import residents"
        subtitle="Bring a roster over from a spreadsheet"
      />
      <ImportPanel homes={session.homes} defaultHomeId={home.id} />
    </AppShell>
  );
}
