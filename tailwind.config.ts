import type { Config } from 'tailwindcss';

// Brand colors resolve through CSS custom properties so a single deployment
// can serve several agencies, each themed from their own palette. The default
// values (At Home Family Services) live in app/globals.css; per-organization
// overrides are emitted at request time from ghh.organizations.branding.
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
        // The FlipBrief marketing palette. Deliberately literal hex rather than
        // CSS variables: `brand-*` above is overridden per organization at
        // request time, and the public landing page must not repaint itself
        // because whoever happens to be signed in themed their workspace pink.
        // Two hues only — forest and sand — plus neutrals warmed toward paper.
        flip: {
          forest: '#14452F',
          moss: '#1E6244',
          fern: '#2F7D57',
          sand: '#D9B382',
          amber: '#B98A4E',
          paper: '#FBF8F3',
          card: '#FFFDFA',
          ink: '#12241C',
          slate: '#5B6862'
        }
      },
      boxShadow: {
        card: '0 10px 30px rgb(var(--brand-navy) / 0.08)',
        // Paper on paper: a short, warm, low-contrast lift. A blue-grey drop
        // shadow on a sand ground reads as plastic.
        leaf: '0 1px 2px rgba(18, 36, 28, 0.05), 0 12px 28px -14px rgba(18, 36, 28, 0.28)',
        lift: '0 2px 4px rgba(18, 36, 28, 0.06), 0 26px 50px -22px rgba(18, 36, 28, 0.38)'
      },
      fontFamily: {
        brand: ['var(--brand-font, ui-sans-serif)', 'system-ui', 'sans-serif'],
        display: ['var(--font-fb-display)', 'Iowan Old Style', 'Georgia', 'serif'],
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
