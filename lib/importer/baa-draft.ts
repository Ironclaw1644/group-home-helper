/**
 * PLACEHOLDER BAA text for the spike's e-sign step.
 *
 * DRAFT — needs legal review before use. These are not legal terms. They exist
 * so the prototype has something to show and version; a lawyer writes the real
 * document, and when that happens BAA_DOCUMENT_VERSION changes, which
 * invalidates every signature made against this placeholder (see phi-gate.ts).
 */
export const BAA_DOCUMENT_VERSION = 'DRAFT-0.1-not-for-use';

export const BAA_DRAFT_BANNER = 'DRAFT — needs legal review before use';

export const BAA_DRAFT_TEXT = `${BAA_DRAFT_BANNER}

This placeholder stands where FlipBrief's Business Associate Agreement will go.
It is not an agreement and signing it in this prototype creates no obligations.

The real document, once written and reviewed by counsel, is expected to cover at
least: permitted uses and disclosures of protected health information,
safeguards, breach notification, subcontractors (including the AI provider that
processes uploaded images), and, for programs subject to 42 CFR Part 2, the
additional restrictions on redisclosure. None of those terms are stated here.

${BAA_DRAFT_BANNER}`;
