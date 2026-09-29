import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileDown } from 'lucide-react';
import { requireSession, orgTimeZoneFor } from '@/lib/auth/session';
import { getTemplateForNote, getAddenda, getNote, getResident, getRoster, getShifts } from '@/lib/notes/repo';
import { AppShell } from '@/components/app-shell';
import { Badge } from '@/components/ui';
import { ResidentSwitcher } from '@/components/note/resident-switcher';
import {
  getNoteActivities,
  getNoteOutcomes,
  listActivities,
  listOutcomes
} from '@/lib/outcomes/repo';
import { displayName } from '@/lib/types';
import { formatServiceDate, todayInTimeZone } from '@/lib/utils';
import NoteEditor from './note-editor';
import SignedNote from './signed-note';

export const dynamic = 'force-dynamic';

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const note = await getNote(id);
  if (!note) notFound();

  // Decrypting the Medicaid ID is a PHI read; we do it here because the number
  // is printed on the form the DSP is filling and on its PDF.
  const [resident, template, shifts, addenda, roster, outcomes, savedOutcomes] =
    await Promise.all([
      getResident(note.residentId, true),
      // A signed note is shown on the form it was signed under, the same one
      // its PDF prints. A draft follows the agency's current form, so a
      // corrected jurisdiction takes effect on work not yet filed.
      getTemplateForNote(note, session.profile.orgId),
      getShifts(note.homeId),
      note.status === 'signed' ? getAddenda(note.id) : Promise.resolve([]),
      // Powers the resident switcher: everyone on this shift, this date.
      getRoster(note.homeId, note.serviceDate),
      // This person's ISP outcomes. Loaded here rather than in the editor so a
      // signed note can render the same list read-only.
      listOutcomes(note.residentId),
      getNoteOutcomes(note.id)
    ]);

  // Activities depend on which outcomes exist, so they follow rather than
  // joining the parallel batch above.
  const [activities, savedActivities] = await Promise.all([
    listActivities(outcomes.map((o) => o.id)),
    getNoteActivities(note.id)
  ]);

  if (!resident) notFound();

  const shift = shifts.find((s) => s.id === note.shiftId);
  if (!shift) redirect('/');

  const backHref = `/?${new URLSearchParams({ home: note.homeId, date: note.serviceDate }).toString()}`;

  const switcherEntries = roster
    .filter((entry) => entry.shiftId === note.shiftId)
    .map((entry) => ({
      residentId: entry.residentId,
      name: `${displayName({
        firstName: entry.residentFirstName,
        preferredName: entry.residentPreferredName
      })} ${entry.residentLastName}`,
      noteId: entry.noteId,
      status: entry.noteStatus
    }));

  // After signing, the next thing a DSP does is the next person. Offer the next
  // unsigned note on this shift, then any shift that day, starting after the
  // current resident so it walks the house in roster order.
  const order = roster.map((r) => r.residentId);
  const after = (id: string) => {
    const i = order.indexOf(id) - order.indexOf(note.residentId);
    return i > 0 ? i : i + order.length;
  };
  const nextEntry = roster
    .filter((r) => r.noteStatus !== 'signed' && !(r.residentId === note.residentId && r.shiftId === note.shiftId))
    .sort(
      (a, b) =>
        Number(b.shiftId === note.shiftId) - Number(a.shiftId === note.shiftId) ||
        after(a.residentId) - after(b.residentId) ||
        a.shiftSort - b.shiftSort
    )[0];
  const nextUp = nextEntry
    ? {
        name: displayName({
          firstName: nextEntry.residentFirstName,
          preferredName: nextEntry.residentPreferredName
        }),
        shiftLabel: nextEntry.shiftLabel,
        href: `/notes/new?${new URLSearchParams({
          resident: nextEntry.residentId,
          shift: nextEntry.shiftId,
          date: note.serviceDate,
          home: note.homeId
        }).toString()}`
      }
    : null;

  return (
    <AppShell session={session}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-slate hover:text-brand-navy"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to roster
        </Link>

        <div className="flex items-center gap-2">
          {resident.isDemo ? <Badge tone="info">Training example</Badge> : null}
          {note.status === 'signed' ? <Badge tone="signed">Signed</Badge> : <Badge tone="draft">Draft</Badge>}
          {note.status === 'signed' ? (
            <Link
              href={`/notes/${note.id}/pdf`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-navy/10 bg-white px-3 py-2 text-xs font-semibold text-brand-navy hover:bg-brand-sand"
            >
              <FileDown className="h-4 w-4" />
              PDF
            </Link>
          ) : null}
        </div>
      </div>

      <ResidentSwitcher
        entries={switcherEntries}
        currentResidentId={note.residentId}
        serviceDate={note.serviceDate}
        shiftId={note.shiftId}
        homeId={note.homeId}
      />

      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-brand-navy">
          {displayName(resident)} {resident.lastName}
        </h1>
        <p className="mt-1 text-sm text-brand-slate">
          {formatServiceDate(note.serviceDate)} · {shift.label}
        </p>
      </div>

      {note.status === 'signed' ? (
        <SignedNote
          nextUp={nextUp}
          backHref={backHref}
          note={note}
          resident={resident}
          template={template}
          shiftLabel={shift.label}
          addenda={addenda}
          canAddAddendum={true}
          signerName={session.profile.fullName}
          signerTitle={session.profile.title}
          outcomes={outcomes}
          savedOutcomes={savedOutcomes}
          activities={activities}
          savedActivities={savedActivities}
        />
      ) : (
        <NoteEditor
          note={note}
          resident={resident}
          template={template}
          shiftLabel={shift.label}
          signerName={session.profile.fullName}
          signerTitle={session.profile.title}
          // Resolved here, in the agency's own timezone. A note prepared for
          // later in the week cannot be signed early, and the phone's clock is
          // not what decides when that day has arrived.
          today={todayInTimeZone(await orgTimeZoneFor(session.profile.orgId))}
          outcomes={outcomes}
          savedOutcomes={savedOutcomes}
          activities={activities}
          savedActivities={savedActivities}
        />
      )}
    </AppShell>
  );
}
