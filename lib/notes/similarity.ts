/**
 * Duplicate-note detection.
 *
 * Copy-pasting yesterday's narrative is the single most common finding in a
 * Medicaid documentation audit: identical notes across days suggest the note
 * was written from habit rather than from the shift. Catching it at signing
 * time — while the DSP can still fix it — is worth more than any report.
 *
 * We compare word bigrams with the Sørensen–Dice coefficient. It ignores
 * punctuation and casing, tolerates reordering, and is cheap enough to run on
 * every keystroke-debounced save.
 */

const WORD_RE = /[a-z0-9']+/g;

function tokenize(text: string): string[] {
  return text.toLowerCase().match(WORD_RE) ?? [];
}

function bigrams(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  // Single-word documents still need one gram, or Dice would read 0 for two
  // identical one-word notes.
  if (tokens.length === 1) {
    counts.set(tokens[0], 1);
    return counts;
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = `${tokens[i]} ${tokens[i + 1]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Similarity in [0, 1]. 1.0 means the two narratives use exactly the same
 * word pairs in the same proportions.
 */
export function narrativeSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const ga = bigrams(ta);
  const gb = bigrams(tb);

  let overlap = 0;
  for (const [gram, countA] of ga) {
    const countB = gb.get(gram);
    if (countB) overlap += Math.min(countA, countB);
  }

  const totalA = [...ga.values()].reduce((s, n) => s + n, 0);
  const totalB = [...gb.values()].reduce((s, n) => s + n, 0);
  if (totalA + totalB === 0) return 0;

  return (2 * overlap) / (totalA + totalB);
}

/** Warn at 90%: near-identical, but not so tight that normal house phrasing trips it. */
export const DUPLICATE_WARN_THRESHOLD = 0.9;

export function isLikelyDuplicate(similarity: number | null | undefined): boolean {
  return typeof similarity === 'number' && similarity >= DUPLICATE_WARN_THRESHOLD;
}
