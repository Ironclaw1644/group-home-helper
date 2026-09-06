import 'server-only';

import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parseBranding, type BrandTokens } from './theme';

/**
 * The agency identity printed on a document.
 *
 * Every PDF this app renders is filed with Medicaid under someone's provider
 * number, so the letterhead is not decoration — it is the claim about who
 * delivered the service. Three routes used to hardcode one agency's name and
 * mark, which meant a second customer printed a first customer's letterhead on
 * their own residents' records. Nothing here has a hardcoded default: an org
 * that has set nothing prints its own name and no logo, never someone else's.
 */

export type PrintIdentity = {
  /** The line at the top of the form: the legal name where one is set. */
  orgLine: string;
  /** Optional second line — a division, program, or DBA. */
  letterhead: string | null;
  /** Optional address block under the name. */
  address: string | null;
  /** Optional line beside the form number in the footer. */
  footer: string | null;
  /** Data URL react-pdf can resolve, or null when the org has no logo. */
  logoSrc: string | null;
  /**
   * The agency's Medicaid provider number.
   *
   * Ohio's documentation rule asks for it by name (OAC 5123-9-30(E)(7),
   * "provider identifier/contract number"); Virginia's Form #680 does not print
   * it. Loaded here either way, because it is a fact about who filed the
   * document, and which jurisdictions print it is the template's business.
   */
  providerId: string | null;
};

/**
 * Free text that is about to be drawn into a PDF.
 *
 * react-pdf renders text as text, so this is not an injection boundary — the
 * cap exists so a pasted essay cannot push the identity block over the
 * resident's name and off the page.
 */
function line(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim().slice(0, max);
  return trimmed || null;
}

/** The extra print fields an agency can set, stored inside `branding`. */
export function parsePrintFields(raw: unknown): {
  letterhead: string | null;
  address: string | null;
  footer: string | null;
  logoPath: string | null;
} {
  const b = (raw ?? {}) as Record<string, unknown>;
  return {
    letterhead: line(b.letterhead_line ?? b.letterheadLine, 120),
    address: line(b.address_line ?? b.addressLine, 200),
    footer: line(b.footer_line ?? b.footerLine, 160),
    logoPath: line(b.logo_path ?? b.logoPath, 500)
  };
}

/**
 * Load the print identity for the caller's own organization.
 *
 * Reads under the caller's RLS rather than the service role, so a route that
 * forgot to check ownership still cannot render another agency's letterhead.
 * Cached per request: the batch export renders many notes and should look the
 * org up once.
 */
export const loadPrintIdentity = cache(async (orgId: string): Promise<PrintIdentity> => {
  const supabase = await createSupabaseServerClient();

  const { data } = await supabase
    .from('organizations')
    .select('name, legal_name, branding, medicaid_provider_id')
    .eq('id', orgId)
    .maybeSingle();

  const tokens: BrandTokens = parseBranding(data?.branding);
  const fields = parsePrintFields(data?.branding);

  // The legal name is what belongs on a Medicaid document; the trading name is
  // the fallback so a form is never headed by a blank.
  const orgLine =
    line(data?.legal_name, 160) ?? line(data?.name, 160) ?? 'Agency name not set';

  const { loadLogoDataUrl } = await import('@/lib/pdf/assets');

  return {
    orgLine,
    providerId: line(data?.medicaid_provider_id, 64),
    letterhead: fields.letterhead,
    address: fields.address,
    footer: fields.footer,
    logoSrc: await loadLogoDataUrl({ logoUrl: tokens.logoUrl, logoPath: fields.logoPath })
  };
});
