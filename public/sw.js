/*
 * Service worker for the installed app (iPhone and Android).
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: cache PHI.
 *
 * It would be easy to cache note pages and API responses so the roster works
 * offline. It would also mean resident names, Medicaid IDs, and shift
 * narratives sitting in an unencrypted Cache Storage bucket on a personal phone
 * that might be lost, sold, or shared. So only static shell assets are cached,
 * and anything that could carry PHI is network-only with a graceful failure.
 *
 * In-progress note text is still safe from a dropped connection — the editor
 * keeps it in localStorage under a single key it clears on successful save
 * (lib/notes/draft-storage.ts). That is a deliberately small, inspectable
 * surface rather than a whole cached API layer.
 */

const VERSION = 'v1';
const SHELL_CACHE = `ghh-shell-${VERSION}`;
const OFFLINE_URL = '/offline.html';

// Static, non-sensitive assets only.
const SHELL_ASSETS = [
  OFFLINE_URL,
  '/site.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/brand/AHFS_logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one missing asset doesn't fail the whole install.
      await Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from older versions so a stale shell can't linger.
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith('ghh-shell-') && n !== SHELL_CACHE).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/** True for anything that could carry resident data. */
function mayContainPhi(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/notes/') ||
    url.pathname.startsWith('/supervisor') ||
    url.pathname === '/'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache PHI. Go to the network; if it fails on a navigation, show the
  // offline page rather than a browser error.
  if (mayContainPhi(url)) {
    event.respondWith(
      fetch(request).catch(async () => {
        if (request.mode === 'navigate') {
          const cached = await caches.match(OFFLINE_URL);
          if (cached) return cached;
        }
        return new Response(
          JSON.stringify({ error: 'offline', message: 'No connection to the notes server.' }),
          { status: 503, headers: { 'content-type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Static assets: cache first, since they are versioned by the build.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const response = await fetch(request);
        if (response.ok && (url.pathname.startsWith('/_next/static/') || SHELL_ASSETS.includes(url.pathname))) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        if (request.mode === 'navigate') {
          const fallback = await caches.match(OFFLINE_URL);
          if (fallback) return fallback;
        }
        return Response.error();
      }
    })()
  );
});

/**
 * Clear every cache on sign-out.
 *
 * The app posts this message so a shared phone doesn't keep the previous
 * user's shell state.
 */
self.addEventListener('message', (event) => {
  if (event.data === 'ghh:clear-caches') {
    event.waitUntil(caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))));
  }
});
