'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * Registers the service worker and shows a connection banner.
 *
 * The service worker makes the app installable on iPhone and Android and keeps
 * the shell loading without a connection. It deliberately caches no resident
 * data — see the comment at the top of public/sw.js for why.
 *
 * The banner matters more than it looks: a DSP who has taken a resident into
 * the community is off the house wifi, and needs to know their note is being
 * held on the phone rather than saved to the record.
 */
export function ServiceWorkerBridge() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Registered after load so it never competes with the first paint.
      const register = () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.warn('[sw] registration failed', err);
        });
      };
      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });
    }

    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="sticky top-14 z-30 flex items-center justify-center gap-2 bg-status-draft px-4 py-2 text-center text-xs font-semibold text-white"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>No connection — your note is saved on this phone and will sync when you reconnect.</span>
    </div>
  );
}
