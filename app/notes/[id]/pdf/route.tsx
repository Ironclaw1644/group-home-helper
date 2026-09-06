import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getSession } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  countServedOnShift,
  getAddenda,
  getHomeName,
  getNote,
  getResident,
  getShifts,
  getTemplateForOrg
} from '@/lib/notes/repo';
import { TemplatePdf } from '@/lib/pdf/TemplatePdf';
import { buildPrintContext } from '@/lib/pdf/print-context';
import {
  getNoteActivities,
  getNoteOutcomes,
  listActivities,
  listOutcomes
} from '@/lib/outcomes/repo';
import { loadSignatureDataUrl } from '@/lib/pdf/assets';
import { loadPrintIdentity } from '@/lib/branding/print';
import { logAccess } from '@/lib/audit';

// react-pdf needs the Node runtime; it does not run on edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;

  // RLS scopes this: a note outside the caller's homes comes back null.
  const note = await getNote(id);
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

  const [resident, template, shifts, addenda, outcomes, noteOutcomes, noteActivities] =
    await Promise.all([
      getResident(note.residentId, true),
      getTemplateForOrg(session.profile.orgId),
      getShifts(note.homeId),
      getAddenda(note.id),
      // Retired outcomes are included: a note signed while an outcome was live
      // must still print the plan it was documented against.
      listOutcomes(note.residentId, true),
      getNoteOutcomes(note.id),
      getNoteActivities(note.id)
    ]);

  const activities = await listActivities(outcomes.map((o) => o.id), true);

  if (!resident) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

  const shift = shifts.find((s) => s.id === note.shiftId);

  // The letterhead comes from the requesting user's own organization. It is
  // never a constant: this route used to print one agency's name and mark on
  // every customer's Medicaid form.
  //
  // The home name and the head count are loaded whether or not this
  // jurisdiction's template prints them. Which fields appear on the page is the
  // template's decision; assembling the facts is this route's.
  const [identity, signatureSrc, placeOfService, groupSize] = await Promise.all([
    loadPrintIdentity(session.profile.orgId),
    loadSignatureDataUrl(note.signatureImagePath),
    getHomeName(note.homeId),
    countServedOnShift(note.homeId, note.shiftId, note.serviceDate)
  ]);

  const buffer = await renderToBuffer(
    <TemplatePdf
      note={note}
      resident={resident}
      template={template}
      ctx={buildPrintContext({
        note,
        resident,
        shift,
        shiftLabel: shift?.label ?? '',
        orgLine: identity.orgLine,
        providerId: identity.providerId,
        placeOfService,
        serviceType: template.renderConfig.service_type,
        groupSize
      })}
      outcomes={outcomes}
      noteOutcomes={noteOutcomes}
      activities={activities}
      noteActivities={noteActivities}
      shiftLabel={shift?.label ?? ''}
      addenda={addenda}
      orgLine={identity.orgLine}
      letterhead={identity.letterhead}
      address={identity.address}
      footerLine={identity.footer}
      logoSrc={identity.logoSrc}
      signatureSrc={signatureSrc}
    />
  );

  // Rendering a PDF surfaces the resident's name and Medicaid ID, so it is a
  // PHI read worth recording separately from viewing the note.
  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'note.pdf', 'note', id, {
    resident_id: note.residentId,
    is_training_example: note.isTrainingExample
  });

  const safeName = `${resident.lastName}_${resident.firstName}_${note.serviceDate}`.replace(
    /[^A-Za-z0-9_-]/g,
    ''
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="DailyProgressNote_${safeName}.pdf"`,
      'Cache-Control': 'no-store, private'
    }
  });
}
