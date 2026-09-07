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
  /** A lighter green, used where a third step is needed on a dark ground. */
  fern: '#2F7D57',
  /** Warm sand. Highlights, wash backgrounds, the folded corner. */
  sand: '#D9B382',
  /** Sand darkened until it is legible as small text on paper. */
  amber: '#B98A4E',
  /** The page. */
  paper: '#FBF8F3',
  /** A sheet lying on the page. */
  card: '#FFFDFA',
  ink: '#12241C',
  /** Muted running text. */
  slate: '#5B6862'
} as const;
