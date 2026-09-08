import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Reachable without signing in.
 *
 * `/download` and `/api/app-version` have to be here: a DSP starting their
 * first shift has no account yet and still needs to install the app.
 *
 * So do the three ways in. Every one of them exists to serve someone who has no
 * session yet, so gating them behind a session would make them unreachable by
 * definition:
 *
 *   /join    — a staff member redeeming an invitation from their supervisor
 *   /signup  — an agency creating its own workspace
 *   /api/auth/demo — provisioning a throwaway sandbox
 *
 * And the way back in. /forgot and /reset are for someone who cannot sign in
 * by definition, so gating them behind a session makes being locked out
 * permanent — which is what it was before they existed.
 *
 * None of these read resident data. Each one authorizes itself: /join checks
 * the code server-side, /signup only ever creates an empty org, and the demo
 * route creates fictional data in an org nobody else can reach.
 */
const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/forgot',
  '/reset',
  '/download',
  '/api/app-version',
  '/join',
  '/signup',
  '/api/auth/join',
  '/api/auth/signup',
  '/api/auth/demo',
  // Stripe has no session to present. The endpoint authenticates the request
  // by verifying Stripe's signature over the raw body instead.
  '/api/webhooks/stripe'
];

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Refreshes the Supabase session cookie on every request and gates the app.
 *
 * The redirect here is a convenience, not the security boundary — RLS is. A
 * request that slips past this still cannot read another home's residents.
 */
export async function middleware(req: NextRequest) {
  let response = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;

  // The root is public, and is matched exactly rather than as a prefix. It
  // cannot go in PUBLIC_PATHS: that list is a prefix match and `'/'` is a
  // prefix of every path there is, so putting it in the array would silently
  // unauthenticate the entire application. `app/page.tsx` serves the marketing
  // page to a signed-out visitor and the roster to a signed-in one; the
  // signed-out branch reads no resident data.
  const isPublic =
    pathname === '/' || PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // /reset is deliberately excluded: following a recovery link signs the
  // person in, and bouncing them to the roster would skip the password change
  // they came to make.
  if (user && pathname === '/login') {
    const homeUrl = req.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  // Excluded from the middleware entirely: build assets, brand images, the
  // downloadable APK, and the PWA files.
  //
  // The PWA exclusions matter more than they look. `sw.js`, `offline.html`, and
  // the manifest have to load *before* a user is authenticated, or the service
  // worker never registers and "Add to Home Screen" produces a shortcut with no
  // offline behaviour. `.apk` matters for the same reason as /download — an
  // unauthenticated phone has to be able to fetch it.
  //
  // `demo/` and `.mp4` are here for the same reason and were missed: the four
  // films on the public page live in public/demo, and every one of them
  // redirected to /login?next=... for exactly the people they are meant to
  // convince. The posters are .jpg so they loaded, which made the page look
  // fine and play nothing — the failure was invisible until somebody pressed
  // play.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|brand/|demo/|apk/|sw\\.js|offline\\.html|site\\.webmanifest|.*\\.(?:png|jpg|jpeg|svg|ico|webmanifest|apk|mp4)$).*)'
  ]
};
