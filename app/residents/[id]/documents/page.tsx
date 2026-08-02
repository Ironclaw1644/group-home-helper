import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireSession, isSupervisor } from '@/lib/auth/session';
import { getResident } from '@/lib/residents/repo';
import { listDocuments } from '@/lib/documents/repo';
import { AppShell } from '@/components/app-shell';
import { DocumentShelf } from '@/components/documents/document-shelf';
import { PageHeader } from '@/components/ui';
import { displayName } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ResidentDocumentsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  // A DSP may read these — the ISP is the point, and they need it on shift.
  // Uploading and removing stays with supervisors.
  const session = await requireSession();
  const { id } = await params;

  const resident = await getResident(id);
  if (!resident) notFound();

  const documents = await listDocuments({ residentId: id });
  const known = displayName(resident);

  return (
    <AppShell session={session}>
      <Link
        href={`/residents?home=${resident.homeId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-brand-navy"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to residents
      </Link>

      <PageHeader
        title="Documents"
        subtitle={`${known} ${resident.lastName}`}
      />

      <DocumentShelf
        documents={documents}
        residentId={id}
        canEdit={isSupervisor(session.profile)}
        subjectName={known}
      />
    </AppShell>
  );
}
