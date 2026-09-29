import { requireSupervisor } from '@/lib/auth/session';
import { AppShell } from '@/components/app-shell';
import { ImportPanel } from '@/components/residents/import-panel';
import { EmptyState, PageHeader } from '@/components/ui';
import { SetupSteps } from '@/components/onboarding/setup-steps';

export const dynamic = 'force-dynamic';

export default async function ImportResidentsPage({
  searchParams
}: {
  searchParams: Promise<{ home?: string; onboarding?: string }>;
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
      {params.onboarding === '1' ? <SetupSteps current="people" /> : null}
      <PageHeader
        title={params.onboarding === '1' ? 'Add the people you support' : 'Import residents'}
        subtitle="Paste a roster or upload the spreadsheet your old system exports"
      />
      <ImportPanel
        homes={session.homes}
        defaultHomeId={home.id}
        nextHref={params.onboarding === '1' ? '/staff?onboarding=1' : null}
      />
    </AppShell>
  );
}
