import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logAccess } from '@/lib/audit';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Logos are stored inline as a data URL rather than in a bucket.
 *
 * A logo is a few kilobytes, it is not PHI, and every consumer already handles
 * data URLs — the PDF renderer, the browser, and the PWA manifest. A bucket
 * would add signed URLs and a lifecycle to manage for no benefit.
 */
const MAX_LOGO_CHARS = 400_000;

const Body = z.object({
  // Personal
  fullName: z.string().trim().min(1).max(120).optional(),
  title: z.string().trim().min(1).max(60).optional(),

  // Agency — supervisors only, enforced below
  orgName: z.string().trim().min(2).max(120).optional(),
  legalName: z.string().trim().max(160).nullable().optional(),
  medicaidProviderId: z.string().trim().max(60).nullable().optional(),
  logoDataUrl: z
    .string()
    .startsWith('data:image/')
    .max(MAX_LOGO_CHARS)
    .nullable()
    .optional(),
  colors: z
    .object({
      navy: z.string().regex(HEX),
      teal: z.string().regex(HEX),
      aqua: z.string().regex(HEX),
      sand: z.string().regex(HEX),
      slate: z.string().regex(HEX)
    })
    .partial()
    .optional()
});

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the fields and try again.' },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const body = parsed.data;

  // --- Personal: anyone may edit their own name and title ------------------
  const profilePatch: Record<string, unknown> = {};
  if (body.fullName !== undefined) profilePatch.full_name = body.fullName;
  if (body.title !== undefined) profilePatch.title = body.title;

  if (Object.keys(profilePatch).length > 0) {
    profilePatch.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from('profiles')
      .update(profilePatch)
      .eq('id', session.profile.id);
    if (error) {
      return NextResponse.json({ error: 'Could not save your details.' }, { status: 400 });
    }
  }

  // --- Agency: supervisors and admins only ---------------------------------
  const wantsOrgChange =
    body.orgName !== undefined ||
    body.legalName !== undefined ||
    body.medicaidProviderId !== undefined ||
    body.logoDataUrl !== undefined ||
    body.colors !== undefined;

  if (wantsOrgChange) {
    if (!isSupervisor(session.profile)) {
      return NextResponse.json(
        { error: 'Only a supervisor or administrator can change agency settings.' },
        { status: 403 }
      );
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('branding')
      .eq('id', session.profile.orgId)
      .maybeSingle();

    const branding = { ...((org?.branding as Record<string, unknown>) ?? {}) };
    if (body.colors) Object.assign(branding, body.colors);
    // null clears the logo back to the neutral default.
    if (body.logoDataUrl !== undefined) branding.logo_url = body.logoDataUrl;

    const patch: Record<string, unknown> = { branding, updated_at: new Date().toISOString() };
    if (body.orgName !== undefined) patch.name = body.orgName;
    if (body.legalName !== undefined) patch.legal_name = body.legalName || null;
    if (body.medicaidProviderId !== undefined) {
      patch.medicaid_provider_id = body.medicaidProviderId || null;
    }

    const { error } = await supabase
      .from('organizations')
      .update(patch)
      .eq('id', session.profile.orgId);

    if (error) {
      return NextResponse.json({ error: 'Could not save agency settings.' }, { status: 400 });
    }

    await logAccess(supabase, req, 'settings.update', 'organization', session.profile.orgId, {
      fields: Object.keys(patch)
    });
  }

  return NextResponse.json({ ok: true });
}
