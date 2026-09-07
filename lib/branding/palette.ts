/**
 * FlipBrief's own palette — the one source of truth for it.
 *
 * These nine values are the product's brand. They are consumed in three
 * places, and it matters that all three agree:
 *
 *  1. `tailwind.config.ts` publishes them as the literal `flip-*` utilities the
 *     public landing page is painted with.
 *  2. `DEFAULT_BRAND` in ./theme.ts uses them as the palette an agency sees
 *     before they set their own.
 *  3. `app/globals.css` carries the same values as the build-time `--brand-*`
 *     fallback.
 *
 * The distinction between (1) and (2) is load-bearing and must survive any
 * edit here: `flip-*` are fixed literals, `--brand-*` are per-organization
 * variables an agency overrides at request time. The landing page is served to
 * strangers and must never repaint itself because of whoever last signed in on
 * that browser, which is why it may only ever use `flip-*`.
 *
 * Two hues — forest and sand — plus neutrals warmed toward paper.
 */
export const FLIP = {
  /** Near-black green. Body text, primary buttons, the darkest ground. */
  forest: '#14452F',
  /** The interactive accent: links, focus rings, active states. Chosen dark
   *  enough to clear 4.5:1 both as text on paper and under white text. */
  moss: '#1E6244',
  /** A lighter green for a third step on a dark ground. Used nowhere at
   *  present, and it manages only 2.18:1 on forest — so if you reach for it as
   *  text, lighten it first. verify:contrast leaves it alone precisely because
   *  nothing uses it; the moment something does, add the pair to that list. */
  fern: '#2F7D57',
  /** Warm sand. Highlights, wash backgrounds, the folded corner. Decorative
   *  only: 1.85:1 on paper, and correctly never used for text on a light
   *  ground. On forest it reaches 5.58:1 and is used as text in the footer. */
  sand: '#D9B382',
  /** Sand darkened until it is legible as small text on paper.
   *
   *  It was #B98A4E, which measured 2.91:1 on paper — failing not only the
   *  4.5:1 it needed but the 3.0:1 large-text floor as well, while the comment
   *  on this line claimed it was legible. It sets every `fb-label` eyebrow on
   *  the landing page and in the walkthrough: small, uppercase, letter-spaced
   *  text, which is the least forgiving thing on the page.
   *
   *  Now 4.58:1 on paper and 4.78:1 on card, at the same hue and saturation.
   *  The colour did not change, it was only taken down far enough to read. */
  amber: '#916A39',
  /** The page. */
  paper: '#FBF8F3',
  /** A sheet lying on the page. */
  card: '#FFFDFA',
  ink: '#12241C',
  /** Muted running text. */
  slate: '#5B6862'
} as const;
