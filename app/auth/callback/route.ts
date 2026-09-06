import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/auth/redirect';

export const dynamic = 'force-dynamic';

/**
 * Where an emailed auth link lands.
 *
 * Supabase sends the recipient to its own /auth/v1/verify, which redirects
 * here with a one-time `code`. The browser client uses PKCE, so the matching
 * verifier is in this browser's cookies and the exchange has to happen
 * server-side, on this request, in this browser — a link forwarded to someone
 * else does not carry the verifier and cannot be redeemed.
 *
 * The middleware already lists this path as public: it has to be reachable by
 * someone who, by definition, cannot sign in.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/reset';

  // Supabase reports an expired or already-used link this way rather than by
  // failing the exchange, so it has to be handled before the happy path.
  const error = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (error) {
    return NextResponse.redirect(new URL('/forgot?expired=1', url.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/forgot?expired=1', url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(new URL('/forgot?expired=1', url.origin));
  }

  return NextResponse.redirect(new URL(safeNextPath(next), url.origin));
}
