import type { Metadata, Viewport } from 'next';
import './globals.css';
import { loadBrand } from '@/lib/branding/load';
import { brandCssVariables } from '@/lib/branding/theme';
import { appFont } from '@/lib/fonts';
import { ServiceWorkerBridge } from '@/components/service-worker';

export const metadata: Metadata = {
  // The product's name, not a customer's. Several agencies use this
  // deployment and the browser tab used to read as one of them.
  title: 'FlipBrief',
  description: 'Daily progress notes for group home and behavioural care staff.',
  // This app is staff-only and holds PHI. Keep it out of every index.
  robots: { index: false, follow: false, nocache: true },
  // Lets staff "Add to Home Screen" so the app gets a real icon and opens
  // full-screen without browser chrome. It is still a web app served from the
  // office machine — there is no app-store build.
  manifest: '/site.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Daily Notes' },
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }]
  }
};

export const viewport: Viewport = {
  // FlipBrief forest, and the same value as DEFAULT_BRAND.navy — so the phone's
  // browser chrome matches the header sitting under it.
  themeColor: '#14452F',
  width: 'device-width',
  initialScale: 1,
  // Do not lock zoom — staff may need to enlarge text.
  maximumScale: 5
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-organization palette. Emitted in <head> so the variables are set before
  // first paint — applying them later would flash the default theme first.
  const brand = await loadBrand();

  return (
    // The typeface variable is set on <html>, not on a page wrapper, so one
    // font serves the public landing page and the signed-in app both.
    <html lang="en" className={appFont.variable}>
      <head>
        <style
          // Values are validated as hex literals in parseBranding, so they
          // cannot break out of the declaration.
          dangerouslySetInnerHTML={{ __html: brandCssVariables(brand) }}
        />
      </head>
      <body className="min-h-dvh">
        <ServiceWorkerBridge />
        {children}
      </body>
    </html>
  );
}
