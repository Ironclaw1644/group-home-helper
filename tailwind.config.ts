import type { Config } from 'tailwindcss';
import { FLIP } from './lib/branding/palette';

// Brand colors resolve through CSS custom properties so a single deployment
// can serve several agencies, each themed from their own palette. The default
// values are FlipBrief's own and live in lib/branding/palette.ts, mirrored as
// the build-time fallback in app/globals.css; per-organization overrides are
// emitted at request time from ghh.organizations.branding.
//
// The `rgb(var(--x) / <alpha-value>)` form is what keeps opacity modifiers
// such as `bg-brand-navy/90` working.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: 'rgb(var(--brand-navy) / <alpha-value>)',
          teal: 'rgb(var(--brand-teal) / <alpha-value>)',
          aqua: 'rgb(var(--brand-aqua) / <alpha-value>)',
          sand: 'rgb(var(--brand-sand) / <alpha-value>)',
          slate: 'rgb(var(--brand-slate) / <alpha-value>)'
        },
        status: {
          missing: '#b4442e',
          draft: '#a26a00',
          signed: '#0a6e3c'
        },
        // The FlipBrief palette. Deliberately literal hex rather than CSS
        // variables: `brand-*` above is overridden per organization at request
        // time, and the public landing page must not repaint itself because
        // whoever happens to be signed in themed their workspace pink.
        //
        // Same nine values `DEFAULT_BRAND` is built from, so an agency that has
        // not themed anything meets the app in the colours of the page that
        // sold it to them — while an agency that has themed overrides `brand-*`
        // and leaves these alone.
        flip: FLIP
      },
      boxShadow: {
        card: '0 10px 30px rgb(var(--brand-navy) / 0.08)',
        // Paper on paper: a short, warm, low-contrast lift. A blue-grey drop
        // shadow on a sand ground reads as plastic.
        leaf: '0 1px 2px rgba(18, 36, 28, 0.05), 0 12px 28px -14px rgba(18, 36, 28, 0.28)',
        lift: '0 2px 4px rgba(18, 36, 28, 0.06), 0 26px 50px -22px rgba(18, 36, 28, 0.38)'
      },
      // One typeface, everywhere. `--font-fb-text` is Archivo, loaded once in
      // the root layout (lib/fonts.ts) and therefore available to the landing
      // page and the signed-in app alike.
      //
      // `brand` is the app's face and still bends to a per-organization
      // `--brand-font`; the difference is only what it falls back to when an
      // agency has not set one. `flip` is fixed, because the public page must
      // not be restyled by whoever last themed this browser.
      fontFamily: {
        brand: ['var(--brand-font, var(--font-fb-text))', 'system-ui', 'sans-serif'],
        display: ['var(--font-fb-text)', 'system-ui', 'sans-serif'],
        flip: ['var(--font-fb-text)', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        xl2: '1.25rem'
      }
    }
  },
  plugins: []
};

export default config;
