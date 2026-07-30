import 'server-only';

import { coerceDraft, NOTE_DRAFT_SCHEMA, type DraftResult, type ModelProvider } from './provider';

/**
 * Hosted provider (OpenAI-compatible).
 *
 * Opt in with AI_PROVIDER=openai. Like the Anthropic path this sends note
 * content off the machine, so it needs a signed BAA with OpenAI and with your
 * host before real resident data goes through it.
 *
 * **This is the API, not ChatGPT.** Pasting a resident's information into
 * chatgpt.com is a different thing entirely: the consumer product is not
 * covered by a BAA, and staff doing it by hand would be an unlogged disclosure
 * of PHI with no audit trail. The point of wiring this in is that it removes
 * the reason anyone would.
 *
 * Deliberately no SDK. This is one POST to one endpoint, and talking to it with
 * `fetch` means no dependency to keep current — and it works unchanged against
 * Azure OpenAI or any OpenAI-compatible gateway via OPENAI_BASE_URL.
 */

export const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');

/** A note is a paragraph. This is generous and exists to stop a runaway spend. */
const MAX_TOKENS = 2000;

const TIMEOUT_MS = 90_000;

type ChatResponse = {
  choices?: Array<{
    message?: { content?: string | null; refusal?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string; type?: string };
};

export function openaiProvider(modelOverride?: string): ModelProvider {
  const model = modelOverride || MODEL;

  return {
    name: 'openai',
    model,
    sendsDataOffMachine: true,

    async health() {
      if (!process.env.OPENAI_API_KEY) {
        return { ok: false, detail: 'OPENAI_API_KEY is not set.' };
      }
      return { ok: true, detail: `Configured for ${model}.` };
    },

    async generate(system: string, userMessage: string): Promise<DraftResult> {
      const started = Date.now();

      // Same reasoning as the Anthropic provider: a missing key is a setup step
      // nobody has done, not a failure, and saying so keeps a DSP from
      // reporting a bug that is really an unfinished install.
      if (!process.env.OPENAI_API_KEY) {
        return {
          ok: false,
          reason: 'unavailable',
          model,
          message:
            'The note assistant has not been set up yet — an administrator needs to add an API key. Everything else works; write the note yourself for now.'
        };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model,
            // The system prompt is byte-identical on every call and sits first,
            // which is what lets the automatic prefix cache hit. Anything
            // variable belongs in the user message.
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: userMessage }
            ],
            max_completion_tokens: MAX_TOKENS,
            // `strict` makes the schema a hard constraint rather than a
            // suggestion, so the response cannot come back shaped wrong.
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'note_draft',
                strict: true,
                schema: NOTE_DRAFT_SCHEMA
              }
            }
            // No temperature: reasoning models reject it, and this has to work
            // across model families without a per-model branch.
          })
        });

        const body = (await res.json().catch(() => null)) as ChatResponse | null;

        if (!res.ok) {
          console.error('[ai] openai request failed', res.status, body?.error?.message);
          return {
            ok: false,
            reason: 'error',
            model,
            message: 'Could not generate a draft right now. Please write the note manually.'
          };
        }

        const choice = body?.choices?.[0];

        // A refused response carries a `refusal` string and no usable content;
        // reading content first would hand back an empty note.
        if (choice?.message?.refusal) {
          return {
            ok: false,
            reason: 'refusal',
            model,
            message: 'The model declined this request. Please write the note manually.'
          };
        }

        const draft = coerceDraft(choice?.message?.content ?? '');
        if (!draft) {
          return {
            ok: false,
            reason: 'empty',
            model,
            message: 'The model returned an empty note. Please write it manually.'
          };
        }

        return {
          ok: true,
          draft,
          usage: {
            inputTokens: body?.usage?.prompt_tokens ?? null,
            outputTokens: body?.usage?.completion_tokens ?? null,
            // OpenAI caches long prompt prefixes automatically and reports the
            // hit here. Cached input is billed at a discount, so the comparison
            // script needs it to price a note honestly.
            cacheReadTokens: body?.usage?.prompt_tokens_details?.cached_tokens ?? null,
            elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1))
          },
          model
        };
      } catch (err) {
        const aborted = err instanceof Error && err.name === 'AbortError';
        console.error('[ai] openai generation failed', err);
        return {
          ok: false,
          reason: 'error',
          model,
          message: aborted
            ? 'The note assistant took too long to respond. Please write the note manually.'
            : 'Could not generate a draft right now. Please write the note manually.'
        };
      } finally {
        clearTimeout(timer);
      }
    }
  };
}
