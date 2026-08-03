import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logAccess } from '@/lib/audit';

/**
 * Add a practice resident.
 *
 * A fictional person for staff to train on. Notes written about them carry
 * `is_training_example`, which is what keeps them out of billing exports while
 * still letting the document print identically to a real one — a trainee should
 * be looking at the real form, not a mock-up.
 *
 * This exists so that deleting the practice resident is a reversible decision.
 * Without it, an agency that cleared a made-up name off their roster would have
 * quietly lost the training feature for good.
 */

const Body = z.object({
  homeId: z.string().uuid()
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can add residents.' },
      { status: 403 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Pick a house first.' }, { status: 400 });
  }

  if (!session.homes.some((h) => h.id === parsed.data.homeId)) {
    return NextResponse.json({ error: 'That house is not one of yours.' }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();

  // One is enough. A second fictional name on the roster is clutter, and the
  // point of the feature is a single well-known person staff recognise.
  const { count } = await supabase
    .from('residents')
    .select('id', { count: 'exact', head: true })
    .eq('is_demo', true);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'You already have a practice resident on the roster.' },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from('residents')
    .insert({
      org_id: session.profile.orgId,
      home_id: parsed.data.homeId,
      first_name: 'Alex',
      last_name: 'Sample',
      pronoun_subject: 'they',
      pronoun_object: 'them',
      pronoun_possessive: 'their',
      // A fictional ID stored in the clear, deliberately: it is not PHI, and a
      // trainee should see the field filled in the way a real one would be. The
      // schema only permits this on a demo resident.
      medicaid_id_demo: 'DEMO-000000',
      is_demo: true,
      active: true
    })
    .select('id')
    .single();

  if (error) {
    console.error('[residents] could not add practice resident', error.message);
    return NextResponse.json({ error: 'Could not add the practice resident.' }, { status: 400 });
  }

  await logAccess(supabase, req, 'resident.create', 'resident', data.id, { training: true });

  return NextResponse.json({ ok: true, id: data.id });
}
