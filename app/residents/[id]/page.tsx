import { notFound } from 'next/navigation';
import { requireSupervisor } from '@/lib/auth/session';
import { getResident } from '@/lib/residents/repo';
import { AppShell } from '@/components/app-shell';
import { ResidentForm } from '@/components/residents/resident-form';
import { Alert, PageHeader } from '@/components/ui';
import { displayName } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function EditResidentPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSupervisor();
  const { id } = await params;

  const resident = await getResident(id);
  if (!resident) notFound();

  const known = displayName(resident);

  return (
    <AppShell session={session}>
      <PageHeader
        title={`${known} ${resident.lastName}`}
        subtitle={session.homes.find((h) => h.id === resident.homeId)?.name}
      />

      {resident.isDemo ? (
        <div className="mb-4">
          <Alert tone="info" title="Training resident">
            <p>
              Alex Sample is fictional and exists so staff can practice on a real-looking note.
              These details are fixed, and notes written about this resident are excluded from
              billing exports.
            </p>
          </Alert>
        </div>
      ) : (
        <ResidentForm
          homes={session.homes}
          defaultHomeId={resident.homeId}
          resident={resident}
        />
      )}
    </AppShell>
  );
}
