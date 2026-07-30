import { requireSupervisor } from '@/lib/auth/session';
import { AppShell } from '@/components/app-shell';
import { ResidentForm } from '@/components/residents/resident-form';
import { EmptyState, PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function NewResidentPage({
  searchParams
}: {
  searchParams: Promise<{ home?: string }>;
}) {
  const session = await requireSupervisor();
  const params = await searchParams;

  if (session.homes.length === 0) {
    return (
      <AppShell session={session}>
        <EmptyState title="No home to add to" body="Create a house before adding residents." />
      </AppShell>
    );
  }

  const home = session.homes.find((h) => h.id === params.home) ?? session.homes[0];

  return (
    <AppShell session={session}>
      <PageHeader title="Add resident" subtitle={home.name} />
      <ResidentForm homes={session.homes} defaultHomeId={home.id} />
    </AppShell>
  );
}
