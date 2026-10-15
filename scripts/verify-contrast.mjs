#!/usr/bin/env node
/**
 * Fail when a colour pair the product actually renders as text falls below
 * WCAG AA.
 *
 * This exists because `amber` shipped at #B98A4E carrying the comment "Sand
 * darkened until it is legible as small text on paper". It measured 2.91:1 --
 * under the 4.5:1 small text needs and under even the 3.0:1 large-text floor --
 * and it set every eyebrow label on the public landing page. The comment
 * asserted the property; nothing checked it; it was wrong for as long as it
 * existed.
 *
 * The buyer here is often in their fifties reading on a phone, and the DSP is
 * reading at the end of a twelve-hour shift, frequently in bad light. Contrast
 * is not a badge on this product, it is whether the words work.
 *
 * Only pairs that are really used are listed. A palette entry nothing renders
 * is not a defect, and policing it would mean either weakening real colours or
 * carrying exceptions for imaginary problems -- `fern` fails on forest and is
 * deliberately absent below, because nothing uses it. Add the pair here the
 * moment something does.
 *
 *   npm run verify:contrast
 */

import { FLIP } from '../lib/branding/palette.ts';

/** WCAG 2.1 relative luminance. */
function luminance(hex) {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Flatten `fg` at `alpha` over `bg`, the way a browser composites a Tailwind
 * opacity suffix such as `text-flip-forest/75`.
 *
 * Opacity was the hole in this gate. Every pair below was measured neat and
 * passed, while the live landing page set its four section captions in
 * `text-flip-forest/70` -- forest blended to #597B6A, 4.44:1, failing AA for
 * 11px text. The gate was right that the palette was fine; what shipped was a
 * colour the palette does not contain. Any pair rendered through an opacity
 * suffix belongs here with that alpha, not at full strength.
 */
function flatten(fg, bg, alpha) {
  if (alpha === 1) return fg;
  const ch = (hex, i) => parseInt(hex.replace('#', '').slice(i * 2, i * 2 + 2), 16);
  const mix = (i) => Math.round(ch(bg, i) + alpha * (ch(fg, i) - ch(bg, i)));
  return `#${[0, 1, 2].map((i) => mix(i).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * fg, bg, the minimum it must clear, where it is rendered, and -- optionally --
 * the opacity it is rendered at. Omitted means the colour is used neat.
 *
 * 4.5 is AA for normal text. 3.0 is AA for large text -- 18.66px bold or 24px
 * plain -- and is used only where the type genuinely is that big. `fb-label` is
 * small and letter-spaced, so it gets 4.5 no matter how short the string is.
 */
const PAIRS = [
  ['forest', 'paper', 4.5, 'landing section captions', 0.75],
  ['paper', 'forest', 4.5, 'landing section captions, on the dark band', 0.7],
  ['amber', 'paper', 4.5, 'fb-label eyebrows on the landing page and walkthrough'],
  ['amber', 'card', 4.5, 'fb-label on a card ground'],
  ['amber', 'paper', 4.5, 'the FAQ +/- sign'],
  ['slate', 'paper', 4.5, 'muted running text'],
  ['slate', 'card', 4.5, 'muted text on a card'],
  ['forest', 'paper', 4.5, 'headings and body copy'],
  ['moss', 'paper', 4.5, 'links and interactive accents'],
  ['paper', 'forest', 4.5, 'body text on the dark footer'],
  ['paper', 'forest', 4.5, 'footer small print and the "made by Luziq" line', 0.75],
  ['sand', 'forest', 4.5, 'the dark footer eyebrow'],
  ['forest', 'sand', 4.5, 'text on a sand highlight']
];

let failed = 0;
console.log();
for (const [fg, bg, min, use, alpha = 1] of PAIRS) {
  const value = ratio(flatten(FLIP[fg], FLIP[bg], alpha), FLIP[bg]);
  const ok = value >= min;
  if (!ok) failed += 1;
  const mark = ok ? 'ok  ' : 'FAIL';
  const label = alpha === 1 ? `${fg} on ${bg}` : `${fg}/${alpha * 100} on ${bg}`;
  console.log(
    `  ${mark}  ${label}`.padEnd(34) +
      `${value.toFixed(2)}:1 (needs ${min.toFixed(1)})  ${use}`
  );
}

console.log();
if (failed === 0) {
  console.log(`Every rendered colour pair clears WCAG AA. (${PAIRS.length} checked)`);
  process.exit(0);
}
console.error(`${failed} colour pair(s) below WCAG AA.`);
console.error('Darken the foreground rather than deleting the check.');
process.exit(1);
