import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor, orgTimeZoneFor } from '@/lib/auth/session';
import { prestageWeek } from '@/lib/notes/prestage-repo';
import { logAccess } from '@/lib/audit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { todayInTimeZone } from '@/lib/utils';

/**
 * Prepare the coming week's notes for one house.
 *
 * A supervisor act, once a week, that turns the daily ten-minute note into a
 * minute: every resident already has an unsigned draft for every shift on every
 * day, carrying their routine, waiting to be corrected and signed.
 *
 * Nothing here signs anything, and nothing here answers a service-plan outcome.
 * Those are the two ways this feature could quietly write a clinical claim on
 * somebody's behalf, and both are refused further down as well — by the sign
 * route, and by the database.
 */

const Body = z.object({
  homeId: z.string().uuid(),
  /** First service date of the week, YYYY-MM-DD. Defaults to today. */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor can prepare a week of notes.' },
      { status: 403 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  // The caller's own homes. A home id from the browser is not evidence of
  // anything; RLS would refuse the writes anyway, but failing here says why.
  if (!session.homes.some((h) => h.id === parsed.data.homeId)) {
    return NextResponse.json({ error: 'That house is not one of yours.' }, { status: 403 });
  }

  const tz = await orgTimeZoneFor(session.profile.orgId);
  const today = todayInTimeZone(tz);
  const from = parsed.data.from ?? today;

  // Preparing a week that has already gone by would create drafts for days
  // nobody can now recall, which is how a note gets written from nothing.
  if (from < today) {
    return NextResponse.json(
      { error: 'A week can only be prepared from today onward.' },
      { status: 400 }
    );
  }

  const result = await prestageWeek({
    orgId: session.profile.orgId,
    homeId: parsed.data.homeId,
    from,
    actorId: session.profile.id
  });

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'notes.prestage', 'home', parsed.data.homeId, {
    from: result.from,
    to: result.to,
    created: result.created,
    existing: result.existing,
    with_routine: result.withRoutine
  });

  return NextResponse.json({ ok: true, ...result });
}
