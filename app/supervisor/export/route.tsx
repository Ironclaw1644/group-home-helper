import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { PDFDocument } from 'pdf-lib';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getActiveTemplate, getAddenda, getNote, getResident, getShifts } from '@/lib/notes/repo';
import { Form680 } from '@/lib/pdf/Form680';
import { loadLogoDataUrl, loadSignatureDataUrl } from '@/lib/pdf/assets';
import { logAccess } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A month of notes for a full house is well within this; the cap exists so a
// mistyped date range cannot try to render years of records in one request.
const MAX_NOTES = 400;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json({ error: 'Supervisors only' }, { status: 403 });
  }

  const url = new URL(req.url);
  const homeId = url.searchParams.get('home') ?? '';
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? '';
  const kind = url.searchParams.get('kind') === 'training' ? 'training' : 'billing';

  const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!homeId || !isDate(from) || !isDate(to) || from > to) {
    return NextResponse.json({ error: 'Invalid export range' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Only signed notes belong in an export. A draft is not a record.
  const { data: rows, error } = await supabase
    .from('notes')
    .select('id, service_date, resident_id, is_training_example')
    .eq('home_id', homeId)
    .eq('status', 'signed')
    .gte('service_date', from)
    .lte('service_date', to)
    // A billing packet contains real services only; a training pack is the
    // fictional-resident notes used for onboarding.
    .eq('is_training_example', kind === 'training')
    .order('service_date')
    .limit(MAX_NOTES + 1);

  if (error) {
    console.error('[export] query failed', error);
    return NextResponse.json({ error: 'Could not build the export' }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json(
      { error: 'There are no signed notes in that range.' },
      { status: 404 }
    );
  }

  const truncated = rows.length > MAX_NOTES;
  const selected = truncated ? rows.slice(0, MAX_NOTES) : rows;

  const [template, shifts, logoSrc] = await Promise.all([
    getActiveTemplate(),
    getShifts(homeId),
    loadLogoDataUrl()
  ]);

  const merged = await PDFDocument.create();
  let included = 0;

  for (const row of selected) {
    const note = await getNote(row.id);
    if (!note) continue;

    const [resident, addenda, signatureSrc] = await Promise.all([
      getResident(note.residentId, true),
      getAddenda(note.id),
      loadSignatureDataUrl(note.signatureImagePath)
    ]);
    if (!resident) continue;

    const buffer = await renderToBuffer(
      <Form680
        note={note}
        resident={resident}
        template={template}
        shiftLabel={shifts.find((s) => s.id === note.shiftId)?.label ?? ''}
        addenda={addenda}
        orgLine="At Home Family Service, LLC"
        logoSrc={logoSrc}
        signatureSrc={signatureSrc}
      />
    );

    const doc = await PDFDocument.load(new Uint8Array(buffer));
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
    included++;
  }

  if (included === 0) {
    return NextResponse.json({ error: 'Could not render any notes in that range.' }, { status: 500 });
  }

  const bytes = await merged.save();

  await logAccess(supabase, req, 'export.batch', 'home', homeId, {
    from,
    to,
    kind,
    note_count: included,
    // Surface truncation in the audit trail as well as the header below — a
    // silently capped export would read as a complete record later.
    truncated
  });

  const label = kind === 'training' ? 'TrainingExamples' : 'BillingPacket';

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${label}_${from}_to_${to}.pdf"`,
      'Cache-Control': 'no-store, private',
      'X-Notes-Included': String(included),
      'X-Notes-Truncated': String(truncated)
    }
  });
}
