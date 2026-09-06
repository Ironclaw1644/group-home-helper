import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSession, orgTimeZoneFor } from '@/lib/auth/session';
import { getActiveTemplate, getPreviousSignedNarrative } from '@/lib/notes/repo';
import { DUPLICATE_WARN_THRESHOLD, narrativeSimilarity } from '@/lib/notes/similarity';
import { logAccess } from '@/lib/audit';
import { formatServiceDate, todayInTimeZone } from '@/lib/utils';

const SignBody = z.object({
  // PNG data URL from the signature canvas. Optional: a typed attestation is
  // still a valid signature if the device cannot draw.
  signatureImage: z.string().startsWith('data:image/png;base64,').max(400_000).nullable(),
  // Recorded so the signing method is part of the permanent record rather than
  // something an auditor has to infer from the image.
  signatureMethod: z.enum(['drawn', 'typed', 'uploaded']).default('drawn'),
  attested: z.literal(true),
  acknowledgeDuplicate: z.boolean().default(false)
});

const SIGNATURE_BUCKET = 'ghh-signatures';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;

  const parsed = SignBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'You must confirm the attestation before signing.' },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();

  const { data: note } = await supabase
    .from('notes')
    .select(
      'id, org_id, resident_id, service_date, narrative, status, locked, author_id, prestaged_at, prestage_confirmed_at'
    )
    .eq('id', id)
    .maybeSingle();

  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  if (note.locked || note.status === 'signed') {
    return NextResponse.json({ error: 'This note is already signed.' }, { status: 409 });
  }
  if (note.author_id !== session.profile.id) {
    return NextResponse.json(
      { error: 'Only the author of this note can sign it.' },
      { status: 403 }
    );
  }
  if (!note.narrative || note.narrative.trim().length === 0) {
    return NextResponse.json({ error: 'Write the note before signing.' }, { status: 400 });
  }

  // A note cannot be signed before the day it documents. Pre-staging creates
  // drafts for dates that have not arrived yet, so without this someone could
  // open Friday's note on Monday and attest to a shift nobody has worked.
  // Measured against the agency's own timezone, since that is what a Medicaid
  // service date means. The database enforces this as well; the check here
  // exists to say so in words rather than surfacing a constraint violation.
  const tz = await orgTimeZoneFor(note.org_id as string);
  if ((note.service_date as string) > todayInTimeZone(tz)) {
    return NextResponse.json(
      {
        error: `This note is for ${formatServiceDate(note.service_date as string)}, which has not happened yet. It can be signed at the end of that shift.`
      },
      { status: 400 }
    );
  }

  // A prepared note carries the resident's usual pattern, which is a starting
  // point and not an observation. Somebody has to say it matches the shift they
  // actually worked before it becomes a permanent record.
  if (note.prestaged_at && !note.prestage_confirmed_at) {
    return NextResponse.json(
      {
        code: 'prestage_unconfirmed',
        error:
          'This note was prepared in advance. Check the entries and confirm they match your shift before signing.'
      },
      { status: 409 }
    );
  }

  // Duplicate check. Copy-forward notes are the most common audit finding, so
  // we block once and let the DSP either revise or explicitly confirm.
  const previous = await getPreviousSignedNarrative(note.resident_id, note.service_date);
  const similarity = previous ? narrativeSimilarity(note.narrative, previous) : 0;

  if (similarity >= DUPLICATE_WARN_THRESHOLD && !parsed.data.acknowledgeDuplicate) {
    return NextResponse.json(
      {
        code: 'duplicate_narrative',
        similarity,
        error: 'This narrative is nearly identical to the previous signed note.'
      },
      { status: 409 }
    );
  }

  // Store the signature image outside the row. The bucket is private; PDFs
  // fetch it server-side with a short-lived signed URL.
  let signaturePath: string | null = null;
  if (parsed.data.signatureImage) {
    try {
      const base64 = parsed.data.signatureImage.split(',')[1] ?? '';
      const bytes = Buffer.from(base64, 'base64');
      const path = `${note.org_id}/${id}.png`;

      const admin = createSupabaseAdminClient();
      const { error: uploadError } = await admin.storage
        .from(SIGNATURE_BUCKET)
        .upload(path, bytes, { contentType: 'image/png', upsert: true });

      if (uploadError) throw uploadError;
      signaturePath = path;
    } catch (err) {
      // A failed image upload must not block the signature itself — the typed
      // name and attestation are what make the note valid.
      console.error('[sign] signature image upload failed', err);
    }
  }

  const template = await getActiveTemplate();

  const { error } = await supabase
    .from('notes')
    .update({
      status: 'signed',
      // signed_at is deliberately not sent. 0020's trigger sets it from the
      // database clock at the moment of signing, so the time on a signature is
      // not something any caller — including this one — gets to supply.
      signed_by: session.profile.id,
      signature_name: session.profile.fullName,
      signature_title: session.profile.title,
      signature_image_path: signaturePath,
      signature_method: parsed.data.signatureMethod,
      attestation_text: template.schema.signature.attestation,
      similarity_prev: previous ? Number(similarity.toFixed(3)) : null
    })
    .eq('id', id);

  if (error) {
    console.error('[sign] update failed', error);
    return NextResponse.json({ error: 'Could not sign this note.' }, { status: 400 });
  }

  await logAccess(supabase, req, 'note.sign', 'note', id, {
    similarity_prev: similarity,
    acknowledged_duplicate: parsed.data.acknowledgeDuplicate,
    signature_method: parsed.data.signatureMethod
  });

  return NextResponse.json({ ok: true });
}
