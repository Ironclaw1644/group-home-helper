import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, isSupervisor } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logAccess } from '@/lib/audit';
import { LOGO_DATA_URL } from '@/lib/branding/theme';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Logos now go to the private `ghh-documents` bucket via /api/branding/logo,
 * and this stores the returned path.
 *
 * `logoDataUrl` is still accepted because agencies that uploaded before the
 * bucket existed have their mark inline in `branding.logo_url`, and their
 * Settings form posts it back unchanged on every save. Dropping it would make
 * those agencies unable to save any setting at all.
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

  // What prints on the form under and around the agency name. Length caps are
  // layout limits: a pasted essay here would push the resident's name off the
  // top of a Medicaid document.
  letterheadLine: z.string().trim().max(120).nullable().optional(),
  addressLine: z.string().trim().max(200).nullable().optional(),
  footerLine: z.string().trim().max(160).nullable().optional(),

  /** A path issued by POST /api/branding/logo. Ownership is checked below. */
  logoPath: z.string().trim().max(500).nullable().optional(),
  // Accepts either a freshly uploaded data URL or the value already stored —
  // an agency whose logo is a shipped path would otherwise be unable to save
  // any setting at all, because the form sends the logo back unchanged.
  logoDataUrl: z
    .string()
    .max(MAX_LOGO_CHARS)
    .refine(
      (v) => LOGO_DATA_URL.test(v) || (v.startsWith('/') && !v.startsWith('//')),
      'Use a PNG, JPG, GIF or WebP image.'
    )
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
    body.logoPath !== undefined ||
    body.letterheadLine !== undefined ||
    body.addressLine !== undefined ||
    body.footerLine !== undefined ||
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

    // null clears each of these back to the neutral default.
    if (body.letterheadLine !== undefined) branding.letterhead_line = body.letterheadLine || null;
    if (body.addressLine !== undefined) branding.address_line = body.addressLine || null;
    if (body.footerLine !== undefined) branding.footer_line = body.footerLine || null;

    if (body.logoPath !== undefined) {
      // The path must be one this org was issued. Without this an agency could
      // point its branding at another agency's object and have the logo route
      // — which trusts the stored path — fetch it with the service role.
      if (body.logoPath && !body.logoPath.startsWith(`${session.profile.orgId}/branding/`)) {
        return NextResponse.json({ error: 'Invalid logo path.' }, { status: 400 });
      }
      branding.logo_path = body.logoPath;
      // A bucket upload replaces any inline logo, so the two cannot disagree.
      if (body.logoPath) branding.logo_url = null;
    }

    if (body.logoDataUrl !== undefined) {
      branding.logo_url = body.logoDataUrl;
      // Clearing the inline logo clears the uploaded one too — "Remove" on the
      // settings screen means the agency has no logo, not that it has the
      // previous one back.
      if (body.logoDataUrl === null && body.logoPath === undefined) branding.logo_path = null;
    }

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
