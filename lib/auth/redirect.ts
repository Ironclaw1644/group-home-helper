/**
 * Where an auth callback is allowed to send someone next.
 *
 * The `next` value arrives on a URL that was sitting in an email inbox, so it
 * is attacker-supplied in the way that matters: a reset link can be crafted,
 * mailed to a care worker, and — if this let an absolute URL through — bounce
 * them to a copy of the sign-in page immediately after the app has just told
 * them their password was accepted. That is the moment they are least likely
 * to look at the address bar.
 *
 * Only a same-origin absolute path is allowed. `//host` is protocol-relative
 * and leaves the origin, so it is not one.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/reset'): string {
  if (typeof next !== 'string') return fallback;
  const trimmed = next.trim();
  if (!trimmed.startsWith('/')) return fallback;
  if (trimmed.startsWith('//')) return fallback;
  // A backslash is treated as a slash by some URL parsers, so /\evil.example
  // can escape the origin in a browser that normalises it.
  if (trimmed.startsWith('/\\')) return fallback;
  return trimmed;
}
