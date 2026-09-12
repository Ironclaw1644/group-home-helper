import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getResident } from '@/lib/residents/repo';
import { getTemplateForOrg } from '@/lib/notes/repo';
import { libraryFor } from '@/lib/outcomes/library';
import { getPresets } from '@/lib/outcomes/presets';
import { fromLibrary, fromPreset, installOutcomes } from '@/lib/outcomes/install';
import { logAccess } from '@/lib/audit';
import { displayName } from '@/lib/types';

const Body = z
  .object({
    residentId: z.string().uuid(),
    keys: z.array(z.string()).max(20).optional(),
    presetIds: z.array(z.string().uuid()).max(20).optional()
  })
  .refine((b) => (b.keys?.length ?? 0) + (b.presetIds?.length ?? 0) > 0, {
    message: 'Nothing selected'
  });

/**
 * Install starter outcomes for a resident.
 *
 * Two sources, one path. `keys` name outcomes in the caller's own
 * jurisdiction's template library; `presetIds` name presets the agency wrote
 * itself. Both are personalized to this resident and written as ordinary
 * editable rows by lib/outcomes/install.ts.
 *
 * These are a drafting aid, not a plan. They land as editable rows so a
 * supervisor rewrites them in the person's own words — a template outcome is
 * by definition not person-centered, which is the whole point of a
 * person-centred plan.
 *
 * The library offered is the one belonging to the caller's own jurisdiction,
 * read from their template. An Ohio supervisor is never offered Virginia's.
 * Presets are read through the caller's client, so RLS keeps one agency's
 * wording out of another agency's plans.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isSupervisor(session.profile)) {
    return NextResponse.json(
      { error: 'Only a supervisor or administrator can edit a service plan.' },
      { status: 403 }
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const resident = await getResident(parsed.data.residentId);
  if (!resident) return NextResponse.json({ error: 'Resident not found' }, { status: 404 });

  const keys = parsed.data.keys ?? [];
  const presetIds = parsed.data.presetIds ?? [];

  const formTemplate = await getTemplateForOrg(session.profile.orgId);
  const chosenLibrary = libraryFor(formTemplate).filter((o) => keys.includes(o.key));

  // Kept in the order the picker listed them rather than the order Postgres
  // returned them, so the plan reads the way the supervisor was looking at it.
  const presetsById = new Map((await getPresets(presetIds)).map((p) => [p.id, p]));
  const chosenPresets = presetIds
    .map((id) => presetsById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const installed = await installOutcomes(
    [...chosenLibrary.map(fromLibrary), ...chosenPresets.map(fromPreset)],
    {
      orgId: session.profile.orgId,
      residentId: resident.id,
      residentName: displayName(resident),
      pronouns: resident.pronouns
    }
  );

  const supabase = await createSupabaseServerClient();
  await logAccess(supabase, req, 'outcome.install_library', 'resident', resident.id, {
    installed,
    from_library: chosenLibrary.length,
    from_presets: chosenPresets.length
  });

  return NextResponse.json({ installed });
}
