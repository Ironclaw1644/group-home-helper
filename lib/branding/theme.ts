/**
 * Per-organization theming.
 *
 * The palette lives in `ghh.organizations.branding` and is emitted as CSS
 * custom properties on the page root. Tailwind's `brand.*` utilities are wired
 * to those variables, so every existing class in the UI re-themes for free —
 * onboarding a new agency is a database row, not a rebuild.
 */

export type BrandTokens = {
  navy: string;
  teal: string;
  aqua: string;
  sand: string;
  slate: string;
  logoUrl: string | null;
  fontFamily: string | null;
};

/** At Home Family Services — the palette the app ships with. */
/**
 * The palette an agency sees before setting their own.
 *
 * Deliberately carries NO logo. This started as one agency's app and the
 * fallback was their mark, which meant every other agency signing up saw
 * someone else's branding on their own residents' forms. A neutral default is
 * the only honest starting point for a product several agencies use; each one
 * uploads their own in Settings.
 *
 * The colours stay — they are a reasonable, accessible starting palette, and an
 * agency that never opens Settings still gets a coherent-looking form.
 */
export const DEFAULT_BRAND: BrandTokens = {
  navy: '#0f2d45',
  teal: '#0c9ea6',
  aqua: '#6fe2df',
  sand: '#f5f1ea',
  slate: '#536779',
  logoUrl: null,
  fontFamily: null
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Only accept values that are safe to interpolate into a stylesheet.
 *
 * Branding is supervisor-editable and can come from scanning an arbitrary
 * website, so these strings are untrusted. Restricting to hex literals means a
 * value can never carry `;` or `}` and break out of the declaration into
 * attacker-controlled CSS.
 */
function safeHex(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

/** Font names are similarly restricted — letters, digits, spaces, and commas. */
function safeFontFamily(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 120);
  return /^[A-Za-z0-9 ,'"-]+$/.test(trimmed) ? trimmed : null;
}

/**
 * Raster image data URLs only.
 *
 * An uploaded logo is stored inline, so `data:` has to be allowed — but only
 * for image types a browser renders as a static bitmap. `data:text/html` and
 * `data:image/svg+xml` are excluded deliberately: SVG is a document format that
 * can carry script and external references, and a logo is agency-supplied
 * input that ends up in an <img> on every page and in every PDF.
 */
export const LOGO_DATA_URL = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$/;

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();

  // Same-origin path, e.g. the shipped /brand/AHFS_logo.png.
  // `//host` is protocol-relative and would leave the origin, so it is not one.
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;

  if (LOGO_DATA_URL.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    // Still no javascript:, and no arbitrary data: beyond the images above.
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseBranding(raw: unknown): BrandTokens {
  const b = (raw ?? {}) as Record<string, unknown>;
  return {
    navy: safeHex(b.navy, DEFAULT_BRAND.navy),
    teal: safeHex(b.teal, DEFAULT_BRAND.teal),
    aqua: safeHex(b.aqua, DEFAULT_BRAND.aqua),
    sand: safeHex(b.sand, DEFAULT_BRAND.sand),
    slate: safeHex(b.slate, DEFAULT_BRAND.slate),
    logoUrl: safeUrl(b.logo_url ?? b.logoUrl) ?? DEFAULT_BRAND.logoUrl,
    fontFamily: safeFontFamily(b.font_family ?? b.fontFamily)
  };
}

/**
 * Hex to the `"R G B"` channel triplet Tailwind needs.
 *
 * The utilities are defined as `rgb(var(--brand-x) / <alpha-value>)`, which is
 * what keeps opacity modifiers like `bg-brand-navy/90` working. A plain hex
 * variable would break every one of those, and the UI uses them throughout.
 */
export function hexToChannels(hex: string): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

/** The inline style block that applies a brand to a page. */
export function brandCssVariables(tokens: BrandTokens): string {
  const lines = [
    `--brand-navy: ${hexToChannels(tokens.navy)};`,
    `--brand-teal: ${hexToChannels(tokens.teal)};`,
    `--brand-aqua: ${hexToChannels(tokens.aqua)};`,
    `--brand-sand: ${hexToChannels(tokens.sand)};`,
    `--brand-slate: ${hexToChannels(tokens.slate)};`
  ];
  if (tokens.fontFamily) lines.push(`--brand-font: ${tokens.fontFamily}, ui-sans-serif, system-ui;`);
  return `:root{${lines.join('')}}`;
}

/**
 * Relative luminance, used to decide whether text on a brand color should be
 * light or dark. A scanned palette can produce a pale "navy", and hard-coding
 * white text on it would make the header unreadable.
 */
export function readableTextOn(hexColor: string): '#ffffff' | '#0b1620' {
  const hex = hexColor.replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;

  const channel = (start: number) => {
    const v = parseInt(full.slice(start, start + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.45 ? '#0b1620' : '#ffffff';
}
