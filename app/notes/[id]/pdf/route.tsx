import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getSession } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getActiveTemplate, getAddenda, getNote, getResident, getShifts } from '@/lib/notes/repo';
import { Form680 } from '@/lib/pdf/Form680';
import { loadLogoDataUrl, loadSignatureDataUrl } from '@/lib/pdf/assets';
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

  const [resident, template, shifts, addenda] = await Promise.all([
    getResident(note.residentId, true),
    getActiveTemplate(),
    getShifts(note.homeId),
    getAddenda(note.id)
  ]);

  if (!resident) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

  const shift = shifts.find((s) => s.id === note.shiftId);

  const [logoSrc, signatureSrc] = await Promise.all([
    loadLogoDataUrl(),
    loadSignatureDataUrl(note.signatureImagePath)
  ]);

  const buffer = await renderToBuffer(
    <Form680
      note={note}
      resident={resident}
      template={template}
      shiftLabel={shift?.label ?? ''}
      addenda={addenda}
      orgLine="At Home Family Service, LLC"
      logoSrc={logoSrc}
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
