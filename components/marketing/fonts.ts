import { Archivo, Fraunces } from 'next/font/google';

/**
 * Type for the marketing layer only.
 *
 * These are loaded as CSS variables and applied on the landing page's own
 * wrapper rather than on <body>, so the signed-in app keeps rendering in the
 * per-organization `--brand-font` it has always used. A marketing typeface has
 * no business changing what a DSP's form looks like at 2am.
 *
 * Fraunces for headings: an old-style serif with optical sizing, drawn with
 * enough character that it reads as a printed record rather than a dashboard.
 * The `SOFT` and `WONK` axes are pulled in so the display sizes can be set
 * slightly softer and less mechanical than the defaults.
 *
 * Archivo for everything else: a grotesque descended from 19th-century American
 * type, tuned for small sizes and highlights. It holds up at 13px on a 390px
 * phone, which is where this page is actually read.
 */
// Both are loaded as variable fonts — one file each, every weight the page
// uses. Listing static weights instead would ship four Archivo files and lose
// Fraunces' optical-size and softness axes, which are the reason it is here.
export const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fb-display',
  axes: ['SOFT', 'WONK', 'opsz']
});

export const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fb-text'
});
