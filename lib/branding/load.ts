import 'server-only';

import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DEFAULT_BRAND, parseBranding, type BrandTokens } from './theme';

/**
 * Load the signed-in user's organization branding.
 *
 * Cached per request so the layout and any component that needs the logo share
 * one query. Falls back to the shipped palette when signed out (the login
 * screen) or if anything goes wrong — an unstyled page would be worse than a
 * slightly wrong one.
 */
export const loadBrand = cache(async (): Promise<BrandTokens> => {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return DEFAULT_BRAND;

    // RLS scopes this to the caller's own organization.
    const { data } = await supabase
      .from('organizations')
      .select('branding, logo_url')
      .limit(1)
      .maybeSingle();

    if (!data) return DEFAULT_BRAND;

    const tokens = parseBranding(data.branding);
    // A top-level logo_url column wins over the one inside branding, since
    // that is what an explicit logo upload writes to.
    return data.logo_url ? { ...tokens, logoUrl: data.logo_url } : tokens;
  } catch {
    return DEFAULT_BRAND;
  }
});
