import { notFound } from 'next/navigation';
import { requireSupervisor } from '@/lib/auth/session';
import { getResident } from '@/lib/residents/repo';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { ResidentForm } from '@/components/residents/resident-form';
import { DeleteResident } from '@/components/residents/delete-resident';
import { FolderOpen, Target, TrendingUp } from 'lucide-react';
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

  // Counted here so the delete confirmation can state exactly what would be
  // destroyed. Discovering it by trying to delete and being refused reads as an
  // error rather than a choice, which is how this ended up feeling broken.
  const supabase = await createSupabaseServerClient();
  const countOf = async (table: string) => {
    const { count } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('resident_id', id);
    return count ?? 0;
  };

  const [notes, signedNotes, documents, outcomes] = await Promise.all([
    countOf('notes'),
    supabase
      .from('notes')
      .select('id', { count: 'exact', head: true })
      .eq('resident_id', id)
      .eq('status', 'signed')
      .then((r) => r.count ?? 0),
    countOf('documents'),
    countOf('resident_outcomes')
  ]);

  const counts = { notes, signedNotes, documents, outcomes };

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
            <Button href={`/residents/${resident.id}/progress`} variant="ghost" size="sm">
              <TrendingUp className="h-4 w-4" />
              Progress
            </Button>
            <Button href={`/residents/${resident.id}/outcomes`} variant="ghost" size="sm">
              <Target className="h-4 w-4" />
              Service plan
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        {resident.isDemo ? (
          <Alert tone="info" title="Training resident">
            <p>
              {known} is fictional and exists so staff can practise on a real-looking note. These
              details are fixed, and notes written about this resident are excluded from billing
              exports. If you would rather not have a made-up person on the roster, delete them
              below.
            </p>
          </Alert>
        ) : (
          <ResidentForm
            homes={session.homes}
            defaultHomeId={resident.homeId}
            resident={resident}
          />
        )}

        <DeleteResident
          residentId={resident.id}
          fullName={`${resident.firstName} ${resident.lastName}`}
          homeId={resident.homeId}
          counts={counts}
          canPurge={session.profile.role === 'admin'}
          isTrainingResident={resident.isDemo}
        />
      </div>
    </AppShell>
  );
}
