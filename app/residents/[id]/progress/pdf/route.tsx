import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getSession } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getResident } from '@/lib/residents/repo';
import { listOutcomes, outcomeProgress } from '@/lib/outcomes/repo';
import { QuarterlyReport } from '@/lib/pdf/QuarterlyReport';
import { loadLogoDataUrl } from '@/lib/pdf/assets';
import { logAccess } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * The quarterly progress review as a signable PDF.
 *
 * Counted from signed notes only — a draft is not a record, and overstating
 * what was documented is the direction of error that gets a provider cited.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;
  const url = new URL(req.url);

  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const from = url.searchParams.get('from') ?? ninetyDaysAgo;
  const to = url.searchParams.get('to') ?? today;

  const resident = await getResident(id);
  if (!resident) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [outcomes, progress] = await Promise.all([
    listOutcomes(id, true),
    outcomeProgress(id, from, to)
  ]);

  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from('notes')
    .select('id', { count: 'exact', head: true })
    .eq('resident_id', id)
    .eq('status', 'signed')
    .gte('service_date', from)
    .lte('service_date', to);

  await logAccess(supabase, req, 'report.quarterly', 'resident', id, { from, to });

  const logoSrc = await loadLogoDataUrl();

  const buffer = await renderToBuffer(
    <QuarterlyReport
      resident={{
        id: resident.id,
        orgId: resident.orgId,
        homeId: resident.homeId,
        firstName: resident.firstName,
        lastName: resident.lastName,
        preferredName: resident.preferredName,
        pronouns: resident.pronouns,
        isDemo: resident.isDemo
      }}
      outcomes={outcomes}
      progress={progress}
      from={from}
      to={to}
      orgLine="At Home Family Service, LLC"
      signedNoteCount={count ?? 0}
      logoSrc={logoSrc}
    />
  );

  const safe = `${resident.lastName}_${resident.firstName}_progress_${from}_${to}`.replace(
    /[^A-Za-z0-9_-]/g,
    ''
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${safe}.pdf"`
    }
  });
}
