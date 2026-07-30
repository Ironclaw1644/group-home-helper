import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { getOrCreateNote, getResident } from '@/lib/notes/repo';

export const dynamic = 'force-dynamic';

/**
 * Opens the note for a resident + shift + date, creating an empty draft the
 * first time. Get-or-create is keyed on (resident, shift, service_date), so
 * hitting this twice is a no-op rather than a duplicate note.
 */
export default async function NewNotePage({
  searchParams
}: {
  searchParams: Promise<{ resident?: string; shift?: string; date?: string; home?: string }>;
}) {
  const session = await requireSession();
  const { resident: residentId, shift: shiftId, date, home: homeId } = await searchParams;

  if (!residentId || !shiftId || !date || !homeId) redirect('/');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect('/');

  // RLS scopes this read, so a resident outside the caller's homes comes back
  // null rather than being silently created against.
  const resident = await getResident(residentId);
  if (!resident || resident.homeId !== homeId) redirect('/');

  const note = await getOrCreateNote({
    orgId: session.profile.orgId,
    homeId,
    residentId,
    shiftId,
    serviceDate: date,
    authorId: session.profile.id
  });

  redirect(`/notes/${note.id}`);
}
