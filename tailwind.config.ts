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
        }
      },
      boxShadow: {
        card: '0 10px 30px rgb(var(--brand-navy) / 0.08)'
      },
      fontFamily: {
        brand: ['var(--brand-font, ui-sans-serif)', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        xl2: '1.25rem'
      }
    }
  },
  plugins: []
};

export default config;
