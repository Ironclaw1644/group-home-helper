import type { Metadata } from 'next';
import { Apple, Download, Share, Smartphone } from 'lucide-react';
import { APK_CHANGELOG, APK_PATH, APK_VERSION } from '@/lib/apk';
import { FlipLogo } from '@/components/brand/mark';

export const metadata: Metadata = {
  title: 'Install FlipBrief',
  description: 'Install the FlipBrief daily notes app on a phone.',
  // Public page, but there is no reason for it to be indexed.
  robots: { index: false, follow: false }
};

/**
 * Public install page.
 *
 * Deliberately reachable without signing in — a DSP starting their first shift
 * has no account yet and needs to get the app onto their phone. It contains no
 * resident data and no credentials; the app itself is behind auth.
 */
export default function DownloadPage() {
  return (
    <main className="min-h-dvh px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-8 text-center">
          {/* The product's mark. A DSP reaching this page has no account yet,
              so there is no organization to theme it with — and it used to
              show one agency's logo to every other agency's staff. */}
          <FlipLogo className="justify-center" />
          <h1 className="mt-4 text-xl font-semibold text-brand-navy">Daily Progress Notes</h1>
          <p className="mt-1 text-sm text-brand-slate">
            Install the app on your phone to write notes on shift.
          </p>
        </header>

        {/* iPhone first — most staff phones, and the install is less obvious. */}
        <section className="mb-5 rounded-2xl border border-white/80 bg-white/90 p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <Apple className="h-5 w-5 text-brand-navy" />
            <h2 className="text-base font-semibold text-brand-navy">iPhone or iPad</h2>
          </div>

          <ol className="space-y-3 text-sm text-brand-navy">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-teal text-xs font-bold text-white">
                1
              </span>
              <span>
                Open this page in <strong>Safari</strong> (not Chrome — the install option only
                appears in Safari).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-teal text-xs font-bold text-white">
                2
              </span>
              <span className="flex flex-wrap items-center gap-1">
                Tap the Share button
                <Share className="inline h-4 w-4 text-brand-slate" />
                at the bottom of the screen.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-teal text-xs font-bold text-white">
                3
              </span>
              <span>
                Scroll down and tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
              </span>
            </li>
          </ol>

          <p className="mt-4 rounded-xl bg-brand-sand/70 p-3 text-xs text-brand-slate">
            The app icon appears on your home screen and opens full-screen, like any other app.
            Updates arrive automatically — you never reinstall.
          </p>
        </section>

        <section className="mb-5 rounded-2xl border border-white/80 bg-white/90 p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-brand-navy" />
            <h2 className="text-base font-semibold text-brand-navy">Android</h2>
          </div>

          <p className="mb-4 text-sm text-brand-navy">
            Either add it to your home screen from Chrome&apos;s menu, or install the app file:
          </p>

          <a
            href={APK_PATH}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-navy/90"
          >
            <Download className="h-4 w-4" />
            Download app (version {APK_VERSION})
          </a>

          <ul className="mt-4 space-y-1.5 text-xs text-brand-slate">
            <li>
              Your phone will ask permission to install from this source — tap{' '}
              <strong>Allow</strong> once.
            </li>
            <li>
              You may see a Play Store warning because the app is installed directly rather than
              through the store. That is expected.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-card">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-brand-slate">
            App versions
          </h2>
          <ul className="space-y-2 text-xs text-brand-slate">
            {APK_CHANGELOG.map((entry) => (
              <li key={entry.version}>
                <span className="font-semibold text-brand-navy">{entry.version}</span> ·{' '}
                {entry.date} — {entry.notes}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-brand-slate">
            Day-to-day updates to the notes app itself happen on the server, so you only need a new
            app file when the version above changes.
          </p>
        </section>

        <p className="mt-8 text-center text-xs text-brand-slate">
          This system contains protected health information. Access is logged.
        </p>
      </div>
    </main>
  );
}
