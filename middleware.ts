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
  // Help answers the questions somebody asks BEFORE they will give you an
  // email address — how a note prints, how an audit batch comes out, what the
  // assistant does with a resident's name. Behind the login wall the only
  // people who could read it were the ones who had already decided. It holds
  // no agency data: it is instructions, and it reads the session only to
  // decide whether to draw the app shell around them.
  '/help',
  // "What we print in your state" — a public page listing every jurisdiction
  // and which rule, if any, its printed page cites. It is the answer to the
  // first question a provider asks, and it holds only template metadata: no
  // organization, resident or note data appears on it.
  '/states',
  // Guides answer the questions a provider searches before they have heard of
  // us — "how do I write a shift note". Each is static copy built from state
  // rules we re-read; none reads a session or any agency's data.
  '/guides',
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

/**
 * Every top-level segment the app actually has.
 *
 * Anything else is not a page, and a signed-out request for it used to be
 * redirected to /login like any other gated path — so a URL that does not
 * exist answered 307 and then 200 with a login form. Google calls that a soft
 * 404, and this domain gets a lot of it: its previous owner published sitemaps
 * of ~100,000 spam URLs under /zhishi/ that crawlers still ask for.
 *
 * So an unknown first segment now gets a real 404 instead of a login page. It
 * fails closed: the request is rewritten to a path that can never be a route
 * (app/_* folders are private), so a section added later and forgotten here
 * shows a 404 to a stranger — never the section itself — until it is listed.
 */
const APP_SECTIONS = new Set([
  'api', 'auth', 'billing', 'download', 'forgot', 'forms', 'guides', 'help', 'join', 'login',
  'notes', 'reports', 'reset', 'residents', 'settings', 'signup', 'staff', 'states', 'supervisor',
  // Static folders under public/ whose files are not all excluded by the
  // matcher's extension list, and Next's and Vercel's own prefixes.
  'walkthrough', 'apk', 'brand', 'demo', '_next', '_vercel',
  // Next's own routes for the metadata files, which the matcher already skips
  // but which are listed so this set reads as complete.
  'robots.txt', 'sitemap.xml', 'manifest.webmanifest', 'icon.png', 'apple-icon.png', 'opengraph-image'
]);

/** The previous owner's spam paths. Gone for good, and saying so. */
const GONE_PREFIXES = ['/zhishi'];

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Refreshes the Supabase session cookie on every request and gates the app.
 *
 * The redirect here is a convenience, not the security boundary — RLS is. A
 * request that slips past this still cannot read another home's residents.
 */
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // Answered before any session work: a 410 tells a crawler to drop the URL
  // faster than a 404 does, and these were never ours.
  if (GONE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return new NextResponse('Gone', { status: 410, headers: { 'X-Robots-Tag': 'noindex' } });
  }
  const section = path.split('/')[1] ?? '';
  if (section !== '' && !APP_SECTIONS.has(section)) {
    return NextResponse.rewrite(new URL('/_not-a-route', req.url));
  }

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
  // `robots.txt` and `sitemap.xml` are for crawlers, who are never signed in;
  // both used to redirect to /login, so Google read the login page as robots.
  //
  // `.txt` is here for the IndexNow key file at the root (public/<key>.txt),
  // which Bing fetches to confirm a ping came from this site. Without it the
  // file 404s under the unknown-path rule above — or, for a signed-out
  // crawler, redirected to /login before that rule existed.
  //
  // `demo/` and `.mp4` are here for the same reason and were missed: the four
  // films on the public page live in public/demo, and every one of them
  // redirected to /login?next=... for exactly the people they are meant to
  // convince. The posters are .jpg so they loaded, which made the page look
  // fine and play nothing — the failure was invisible until somebody pressed
  // play.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|brand/|demo/|apk/|sw\\.js|offline\\.html|site\\.webmanifest|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|svg|ico|webmanifest|apk|mp4|txt)$).*)'
  ]
};
