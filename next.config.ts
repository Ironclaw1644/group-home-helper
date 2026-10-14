import type { NextConfig } from 'next';

/** Public pages that may appear in search. Everything else stays noindex. */
const INDEXABLE = ['/', '/states', '/states/:code', '/guides/:slug*'];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Put <title> and the meta tags in <head> for every visitor, not only for
  // the short list of crawlers Next recognises. Since 15.2 Next streams the
  // metadata of a dynamic page into <body> unless the user agent is on that
  // list — and Googlebot is not on it, because Google renders JavaScript. The
  // landing page is dynamic (it is the roster when signed in), so its title
  // and description arrived ~70 KB into the body for everybody, Googlebot
  // included. Lighthouse reported "Document does not have a meta description"
  // on a page that has one, and any crawler that reads only <head> saw none.
  // The cost is that the head waits for generateMetadata, which on the
  // landing page is the session lookup the page needs anyway.
  htmlLimitedBots: /.*/,
  // PHI must never be cached by an intermediary or indexed.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' }
        ]
      },
      // Everything below overrides the rule above for the paths it names. When
      // two rules set the same header on a path, Next keeps the LAST one, so
      // these exceptions have to come after the global policy, not before it.
      {
        // The service worker and the offline shell hold no PHI and must be
        // cacheable for the app to work without a connection.
        source: '/:file(sw.js|offline.html|site.webmanifest)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' }
        ]
      },
      ...INDEXABLE.map((source) => ({
        // The public pages a search engine should find. A crawler is never
        // signed in, so '/' is the landing page for it; the signed-in roster
        // at the same URL still carries the layout's noindex meta tag, and
        // still cannot be fetched without a session. Cache-Control stays
        // private on all of them for that same reason.
        source,
        headers: [{ key: 'X-Robots-Tag', value: 'index, follow' }]
      })),
      {
        // Marketing images and the demo films. No PHI, but the names are not
        // content-hashed, so a day rather than a year.
        source: '/:dir(demo|walkthrough|brand)/:file*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }
        ]
      },
      {
        source: '/:file(icon-192.png|icon-512.png|apple-touch-icon.png|og.png|favicon.ico)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }
        ]
      }
    ];
  }
};

export default nextConfig;
