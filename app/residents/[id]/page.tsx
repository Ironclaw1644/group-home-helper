import { notFound } from 'next/navigation';
import { requireSupervisor } from '@/lib/auth/session';
import { getResident } from '@/lib/residents/repo';
import { AppShell } from '@/components/app-shell';
import { ResidentForm } from '@/components/residents/resident-form';
import { FolderOpen, Target } from 'lucide-react';
import { Alert, Button, PageHeader } from '@/components/ui';
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
        actions={
          <>
            <Button href={`/residents/${resident.id}/documents`} variant="ghost" size="sm">
              <FolderOpen className="h-4 w-4" />
              Documents
            </Button>
            <Button href={`/residents/${resident.id}/outcomes`} variant="ghost" size="sm">
              <Target className="h-4 w-4" />
              Service plan
            </Button>
          </>
        }
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
