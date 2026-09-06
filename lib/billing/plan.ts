/**
 * Plan facts that both the server and the browser need to state.
 *
 * Separate from `stripe.ts` only because that file is `server-only` — it holds
 * the secret key — and the sign-up page has to tell a prospect what the free
 * allowance is before they have an account. One constant, one source of truth,
 * so the number quoted on the way in is the number actually enforced.
 */

/** Assistant drafts an agency gets before a subscription is required. */
export const FREE_ALLOWANCE = 10;
