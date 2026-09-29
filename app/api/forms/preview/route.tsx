import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getSession, isSupervisor, orgTimeZone } from '@/lib/auth/session';
import { TemplatePdf } from '@/lib/pdf/TemplatePdf';
import { loadPrintIdentity } from '@/lib/branding/print';
import { normalizeEditable, renderConfigFor, schemaFor } from '@/lib/importer/editable';
import { getStandardTemplateForOrg } from '@/lib/importer/templates';
import { samplePrint } from '@/lib/importer/sample';
import { todayInTimeZone } from '@/lib/utils';

export const runtime = 'nodejs';

/**
 * The form under review, printed exactly as a note would print — filled with
 * a made-up person so an admin sees the finished page before confirming.
 * Built with the same functions the confirm route stores, so it cannot
 * preview a layout that would not be saved. Stores nothing.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json({ error: 'Only a supervisor or administrator can preview forms.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { form?: unknown } | null;
  const normalized = normalizeEditable(body?.form);
  if (!normalized.ok) return NextResponse.json({ error: normalized.errors.join(' ') }, { status: 400 });

  const orgId = session.profile.orgId;
  const [base, identity, tz] = await Promise.all([
    getStandardTemplateForOrg(orgId),
    loadPrintIdentity(orgId),
    orgTimeZone()
  ]);

  const template = {
    ...base,
    name: normalized.form.title,
    // A preview never shows a form number: only a confirmed, verified one prints.
    formNumber: null,
    schema: schemaFor(normalized.form, base.schema),
    renderConfig: renderConfigFor(normalized.form, base.renderConfig)
  };

  const { note, resident, ctx } = samplePrint({
    template,
    orgLine: identity.orgLine,
    providerId: identity.providerId,
    signerName: session.profile.fullName,
    signerTitle: session.profile.title ?? '',
    serviceDate: todayInTimeZone(tz)
  });

  const buffer = await renderToBuffer(
    <TemplatePdf
      note={note}
      resident={resident}
      template={template}
      ctx={ctx}
      shiftLabel="Day shift"
      addenda={[]}
      orgLine={identity.orgLine}
      letterhead={identity.letterhead}
      address={identity.address}
      footerLine="SAMPLE — made-up person, not a record"
      logoSrc={identity.logoSrc}
      signatureSrc={null}
    />
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="FormPreview_SAMPLE.pdf"',
      'Cache-Control': 'no-store, private'
    }
  });
}
