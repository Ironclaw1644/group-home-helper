import 'server-only';

/**
 * Model provider abstraction.
 *
 * The free, downloadable version runs entirely on the operator's own machine
 * against a local model, so no PHI ever leaves the building and no BAA is
 * needed with anyone. The hosted path stays available for agencies that would
 * rather not run a model locally, but it is opt-in.
 *
 * There were three providers. The OpenAI adapter has been removed rather than
 * left disabled, because production was running on it: an agency's residents,
 * their Medicaid IDs and their shift narratives were going to a vendor with no
 * BAA in place. An adapter that can be re-enabled by one environment variable
 * is an adapter that will be, so the file is gone and 'openai' is no longer a
 * value this app understands.
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
      description:
        'Statements present in your narrative that no input supports. Rewording or summarizing the input is NOT unsupported. Do NOT list questions you could not answer, information you lacked, or prompts you left out — those are not claims. Only list something you actually wrote and could not support. Normally empty.'
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

export type ProviderName = 'local' | 'anthropic';

/**
 * Which provider to use.
 *
 * Local is the default and the fallback for anything unrecognised. That
 * fallback is deliberate rather than lazy: an unreadable AI_PROVIDER must fail
 * towards the option that transmits no PHI, never towards one that does.
 *
 * `openai` used to be selectable and was what production ran. It is gone —
 * see the note on the removed adapter below — and a stale AI_PROVIDER=openai
 * now resolves to local rather than silently doing nothing or crashing.
 */
export function activeProvider(): ProviderName {
  const configured = process.env.AI_PROVIDER;
  if (configured === 'anthropic') return 'anthropic';

  if (configured && configured !== 'local') {
    console.warn(
      `[ai] AI_PROVIDER="${configured}" is not a provider this app has. Using the local model.`
    );
  }
  return 'local';
}

export type StructuredResult<T> =
  | { ok: true; data: T; usage: DraftUsage }
  | { ok: false; message: string };

export type ModelProvider = {
  name: ProviderName;
  model: string;
  /** True when PHI would leave the machine — drives the de-identification default. */
  sendsDataOffMachine: boolean;
  generate(system: string, userMessage: string): Promise<DraftResult>;
  /**
   * Extract arbitrary structured data against a caller-supplied schema.
   *
   * Separate from generate() on purpose: that path is welded to the note-draft
   * schema and its grounding guards, which are the right thing for a progress
   * note and the wrong thing for reading a roster.
   *
   * Still optional on the type, but both shipped providers implement it. It
   * used to be openai-only, which meant the roster importer quietly did not
   * work on the default provider.
   */
  generateStructured?<T>(
    system: string,
    userMessage: string,
    schema: Record<string, unknown>,
    schemaName: string
  ): Promise<StructuredResult<T>>;
  /** Actionable status for the setup screen and the health endpoint. */
  health(): Promise<{ ok: boolean; detail: string }>;
};

export async function getProvider(): Promise<ModelProvider> {
  switch (activeProvider()) {
    case 'anthropic': {
      const { anthropicProvider } = await import('./anthropic');
      return anthropicProvider();
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
