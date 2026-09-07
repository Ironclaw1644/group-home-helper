import { Archivo } from 'next/font/google';

/**
 * FlipBrief's typeface. There is one, and this is it.
 *
 * Archivo: a grotesque descended from 19th-century American type, drawn for
 * highlights and small text at once. Two axes are loaded — weight and width —
 * which is what lets one family cover both jobs the product has. Set heavy and
 * slightly expanded it carries a headline on the landing page; set at 400 it
 * holds up at 13px on a 390px phone, which is where a DSP actually reads it at
 * the end of a shift.
 *
 * It is loaded here rather than in the marketing folder, and applied to <html>
 * in app/layout.tsx, so the landing page and the signed-in app are set in the
 * same face. The page that sells the product and the product should not look
 * like two companies.
 *
 * It arrives as the CSS variable `--font-fb-text` and is never applied
 * directly. The app reads it through `--brand-font`'s fallback, so an agency
 * that has set their own font in Settings still gets theirs; the landing page
 * reads it through the fixed `font-flip` utility, so a themed organization can
 * never restyle a page served to strangers.
 */
export const appFont = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fb-text',
  axes: ['wdth']
});
