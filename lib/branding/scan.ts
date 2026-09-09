import 'server-only';

import { DEFAULT_BRAND, type BrandTokens } from './theme';

/**
 * Extract a brand palette from an agency's public website.
 *
 * Onboarding a new group home shouldn't mean asking their office manager for
 * hex codes. Point this at their homepage and it proposes a theme from what the
 * site actually uses — a supervisor then reviews and adjusts before it applies.
 *
 * It reads the HTML and any same-origin stylesheets. No browser, no JS
 * execution: a site that paints entirely from client-side JS will yield little,
 * which is why the result is always a *proposal* rather than applied directly.
 */

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 2_000_000;
const MAX_STYLESHEETS = 4;

export type ScanResult = {
  ok: boolean;
  sourceUrl: string;
  tokens: BrandTokens;
  /** Colors ranked by frequency, for a "pick a different one" UI. */
  palette: string[];
  logoCandidates: string[];
  notes: string[];
};

/**
 * Fetch with a size and time cap.
 *
 * The URL is supplied by a user, so this is an SSRF surface: it is restricted
 * to http/https and to public hostnames, so it can't be pointed at cloud
 * metadata endpoints or anything on the local network.
 */
async function fetchText(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isPrivateHost(parsed.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      // Identifies the product, not a customer. This read
      // "AHFS-Notes-BrandScan/1.0", so every prospect whose site we fetched
      // got one particular agency's name in their access log, on a request
      // they never asked for.
      headers: { 'user-agent': 'FlipBrief-BrandScan/1.0' }
    });
    if (!res.ok) return null;

    const reader = res.body?.getReader();
    if (!reader) return (await res.text()).slice(0, MAX_BYTES);

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > MAX_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Blocks loopback, link-local, and RFC1918 targets. */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return true;
  if (h === '0.0.0.0' || h === '::1' || h === '[::1]') return true;

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    // AWS/GCP metadata
    if (a === 169 && b === 254) return true;
  }
  return false;
}

/**
 * Framework default palettes — Tailwind's neutral ramp, Bootstrap's greys.
 *
 * These appear constantly on modern sites and are furniture, not identity.
 * Left in, they win on frequency and produce a theme that looks like a
 * component library rather than the agency: scanning At Home Family Services
 * picked Tailwind gray-200 for the page background over their actual warm
 * sand, which was sitting two places lower in the same palette.
 */
const FRAMEWORK_NEUTRALS = new Set([
  '#f9fafb', '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af',
  '#6b7280', '#4b5563', '#374151', '#1f2937', '#111827',
  '#f8f9fa', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd',
  '#6c757d', '#495057', '#343a40', '#212529',
  '#fafafa', '#f5f5f5', '#eeeeee', '#e0e0e0', '#bdbdbd'
]);

/** Decode the handful of HTML entities that show up inside attribute values. */
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x2F;/gi, '/');
}

const HEX_RE = /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi;
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/gi;

function normalizeHex(hex: string): string {
  const h = hex.replace('#', '').toLowerCase();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return `#${full}`;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const ch = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4);
}

function saturation(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Count every color mentioned in the markup and stylesheets. */
function collectColors(text: string): Map<string, number> {
  const counts = new Map<string, number>();

  for (const match of text.matchAll(HEX_RE)) {
    const hex = normalizeHex(match[0]);
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  for (const match of text.matchAll(RGB_RE)) {
    const hex = rgbToHex(Number(match[1]), Number(match[2]), Number(match[3]));
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }

  return counts;
}

function absoluteUrl(href: string, base: string): string | null {
  try {
    // Attribute values arrive entity-encoded; an un-decoded `&amp;` in a query
    // string yields a URL that 404s.
    return new URL(decodeEntities(href), base).toString();
  } catch {
    return null;
  }
}

/** Logo candidates, best guess first. */
function findLogos(html: string, base: string): string[] {
  const found: string[] = [];
  const push = (href: string | undefined) => {
    if (!href) return;
    const abs = absoluteUrl(href, base);
    if (abs && !found.includes(abs)) found.push(abs);
  };

  // An <img> whose src, alt, or class mentions "logo" is the strongest signal.
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    if (/logo|brand|wordmark/i.test(tag)) {
      push(tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1]);
    }
  }

  push(html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]);
  push(html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1]);
  push(html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1]);

  return found.slice(0, 6);
}

function findThemeColor(html: string): string | null {
  const meta = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (!meta) return null;
  const hex = meta.trim().match(HEX_RE)?.[0];
  return hex ? normalizeHex(hex) : null;
}

function findFont(text: string): string | null {
  const family = text.match(/font-family\s*:\s*([^;}"']+)/i)?.[1];
  if (!family) return null;
  const first = family.split(',')[0]?.trim().replace(/["']/g, '');
  if (!first || first.length > 40) return null;
  // Skip generic stacks — they tell us nothing about the brand.
  if (/^(inherit|initial|sans-serif|serif|monospace|system-ui|-apple-system)$/i.test(first)) {
    return null;
  }
  return /^[A-Za-z0-9 -]+$/.test(first) ? first : null;
}

export async function scanBrand(rawUrl: string): Promise<ScanResult> {
  const notes: string[] = [];
  const sourceUrl = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;

  const html = await fetchText(sourceUrl);
  if (!html) {
    return {
      ok: false,
      sourceUrl,
      tokens: DEFAULT_BRAND,
      palette: [],
      logoCandidates: [],
      notes: ['Could not load that page. Check the address, or enter the colors by hand.']
    };
  }

  // Same-origin stylesheets carry most of the palette; inline HTML rarely does.
  let combined = html;
  const sheetHrefs: string[] = [];
  for (const m of html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)) {
    const href = m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    const abs = href ? absoluteUrl(href, sourceUrl) : null;
    if (abs && new URL(abs).origin === new URL(sourceUrl).origin) sheetHrefs.push(abs);
  }

  for (const href of sheetHrefs.slice(0, MAX_STYLESHEETS)) {
    const css = await fetchText(href);
    if (css) combined += `\n${css}`;
  }
  if (sheetHrefs.length === 0) {
    notes.push('No same-origin stylesheets found — colors were read from the page markup only.');
  }

  const counts = collectColors(combined);
  if (counts.size === 0) {
    notes.push('No colors found. The site may paint entirely from JavaScript.');
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex)
    // Pure black and white are structural, not brand identity.
    .filter((hex) => hex !== '#000000' && hex !== '#ffffff');

  // Pick roles by where a color sits in lightness/saturation space, which
  // matches how the existing tokens are used: navy for headers and body text,
  // teal for actions, sand for the page background.
  const coloured = ranked.filter((hex) => saturation(hex) > 0.15);
  const themeColor = findThemeColor(html);

  const branded = ranked.filter((hex) => !FRAMEWORK_NEUTRALS.has(hex));
  const brandedColoured = coloured.filter((hex) => !FRAMEWORK_NEUTRALS.has(hex));

  const dark = brandedColoured.filter((hex) => luminance(hex) < 0.25);
  const mid = brandedColoured.filter((hex) => luminance(hex) >= 0.25 && luminance(hex) < 0.65);

  // Page background: prefer a light color with a hint of warmth over a flat
  // grey. Sorting by saturation is what separates a deliberate off-white from
  // a default one.
  const light = branded
    .filter((hex) => luminance(hex) >= 0.82)
    .sort((a, b) => saturation(b) - saturation(a));

  const navy = themeColor ?? dark[0] ?? DEFAULT_BRAND.navy;
  const teal = mid[0] ?? brandedColoured[0] ?? DEFAULT_BRAND.teal;
  const aqua = mid[1] ?? DEFAULT_BRAND.aqua;
  const sand = light[0] ?? DEFAULT_BRAND.sand;
  const slate = mid.find((h) => saturation(h) < 0.4) ?? DEFAULT_BRAND.slate;

  const logoCandidates = findLogos(html, sourceUrl);
  if (logoCandidates.length === 0) notes.push('No logo found — you can upload one instead.');

  return {
    ok: true,
    sourceUrl,
    tokens: {
      navy,
      teal,
      aqua,
      sand,
      slate,
      logoUrl: logoCandidates[0] ?? null,
      fontFamily: findFont(combined)
    },
    palette: ranked.slice(0, 24),
    logoCandidates,
    notes
  };
}
