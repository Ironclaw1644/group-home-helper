import 'server-only';

/**
 * Model provider abstraction.
 *
 * The free, downloadable version runs entirely on the operator's own machine
 * against a local model, so no PHI ever leaves the building and no BAA is
 * needed with anyone. The hosted paths stay available for agencies that would
 * rather not run a model locally, but they are opt-in.
 *
 * Every provider produces the same NoteDraft and goes through the same guards,
 * so switching vendors is an env var rather than a rewrite. That is deliberate:
 * model pricing moves fast, and being able to re-price the whole system by
 * changing one line is worth more than any single vendor choice.
 */

export const NOTE_DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    narrative: {
      type: 'string',
      description: 'The progress note paragraph. One paragraph, no line breaks, no headings.'
    },
    entities_used: {
      type: 'array',
      items: { type: 'string' },
      description: 'The specific input items this narrative draws on.'
    },
    unsupported_claims: {
      type: 'array',
      items: { type: 'string' },
      description: 'Anything in the narrative not supported by the input. Should be empty.'
    }
  },
  required: ['narrative', 'entities_used', 'unsupported_claims'],
  additionalProperties: false
} as const;

export type NoteDraft = {
  narrative: string;
  entities_used: string[];
  unsupported_claims: string[];
};

export type DraftUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  /** Wall-clock seconds. The number that decides whether staff will use this. */
  elapsedSeconds: number | null;
};

export type DraftResult =
  | { ok: true; draft: NoteDraft; usage: DraftUsage; model: string }
  | {
      ok: false;
      reason: 'refusal' | 'empty' | 'unavailable' | 'error';
      message: string;
      model: string;
    };

export type ProviderName = 'local' | 'anthropic' | 'openai';

export function activeProvider(): ProviderName {
  // Local is the default: the downloadable version should work with no
  // account, no key, and no data leaving the machine.
  const configured = process.env.AI_PROVIDER;
  if (configured === 'anthropic') return 'anthropic';
  if (configured === 'openai') return 'openai';
  return 'local';
}

export type ModelProvider = {
  name: ProviderName;
  model: string;
  /** True when PHI would leave the machine — drives the de-identification default. */
  sendsDataOffMachine: boolean;
  generate(system: string, userMessage: string): Promise<DraftResult>;
  /** Actionable status for the setup screen and the health endpoint. */
  health(): Promise<{ ok: boolean; detail: string }>;
};

export async function getProvider(): Promise<ModelProvider> {
  switch (activeProvider()) {
    case 'anthropic': {
      const { anthropicProvider } = await import('./anthropic');
      return anthropicProvider();
    }
    case 'openai': {
      const { openaiProvider } = await import('./openai');
      return openaiProvider();
    }
    default: {
      const { ollamaProvider } = await import('./ollama');
      return ollamaProvider();
    }
  }
}

/** Parse and shape-check a model's JSON response. */
export function coerceDraft(raw: string): NoteDraft | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;
  if (typeof obj.narrative !== 'string' || obj.narrative.trim() === '') return null;

  const toStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  return {
    narrative: obj.narrative.trim(),
    entities_used: toStringArray(obj.entities_used),
    unsupported_claims: toStringArray(obj.unsupported_claims)
  };
}
