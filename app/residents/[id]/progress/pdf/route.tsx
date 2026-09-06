import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { getSession, orgTimeZoneFor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getResident } from '@/lib/residents/repo';
import { listOutcomes, outcomeProgress } from '@/lib/outcomes/repo';
import { QuarterlyReport } from '@/lib/pdf/QuarterlyReport';
import { loadPrintIdentity } from '@/lib/branding/print';
import { logAccess } from '@/lib/audit';
import { addDays, todayInTimeZone } from '@/lib/utils';

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

  // "Today" and the default window are the agency's, not the server's. A UTC
  // host would otherwise roll the quarter over hours early for a west-coast
  // customer and silently change which notes are counted.
  const timeZone = await orgTimeZoneFor(session.profile.orgId);
  const today = todayInTimeZone(timeZone);
  const ninetyDaysAgo = addDays(today, -90);
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

  const identity = await loadPrintIdentity(session.profile.orgId);

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
      orgLine={identity.orgLine}
      letterhead={identity.letterhead}
      address={identity.address}
      footerLine={identity.footer}
      generatedOn={today}
      signedNoteCount={count ?? 0}
      logoSrc={identity.logoSrc}
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
