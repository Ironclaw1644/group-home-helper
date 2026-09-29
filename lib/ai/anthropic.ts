import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
// The SDK's zodOutputFormat helper is typed against the v4 API, exposed by
// zod 3.25+ on this subpath. Request validation elsewhere in the app uses the
// classic `zod` import; the two coexist deliberately.
import * as z from 'zod/v4';
import type { DraftResult, ModelProvider, StructuredResult } from './provider';

/**
 * Hosted provider (Anthropic).
 *
 * Opt in with AI_PROVIDER=anthropic. This sends note content off the machine,
 * so de-identification (deid.ts) stays on: the model sees "R.", the chip
 * labels and scrubbed free text, never a name, a date of service, an ID, a
 * house or a colleague. Sending the real record needs signed BAAs with
 * Anthropic and the host first — FlipBrief has none today, and nothing in this
 * file may be read as saying otherwise.
 *
 * It is the only hosted provider: the OpenAI adapter was removed because
 * production was running on it without a BAA.
 */

/**
 * Which model to bill.
 *
 * A progress note is a short paragraph in a tightly specified voice with the
 * facts supplied — close to the cheapest thing you can ask a model to do, and
 * the deterministic guards in guard.ts catch what a weaker model gets wrong.
 * So the model is a cost dial, not an architectural choice. See the model
 * comparison in the README for measured pass rates per tier.
 */
export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

/**
 * How hard the model thinks before writing, per model.
 *
 * A DSP is waiting on a phone mid-shift, and rendering recorded selections as a
 * paragraph is not a reasoning problem, so the 5.x models run at `low`. Haiku
 * 4.5 does not accept an effort setting at all — sending one is a 400 — so it
 * gets none rather than paying a failed round trip on every note.
 */
export function effortFor(model: string): 'low' | 'medium' | null {
  if (/haiku/.test(model)) return null;
  return 'low';
}

/**
 * Past this a DSP has given up waiting. One retry, then the route falls back
 * (see generateWithFallback in provider.ts) instead of spinning for a minute.
 */
const DRAFT_TIMEOUT_MS = 20_000;

const NoteDraftSchema = z.object({
  narrative: z
    .string()
    .describe('The progress note paragraph. One paragraph, no line breaks, no headings.'),
  entities_used: z
    .array(z.string())
    .describe('The specific input items this narrative draws on.'),
  unsupported_claims: z
    .array(z.string())
    .describe(
      'Statements present in your narrative that no input supports. Rewording or summarizing the input is NOT unsupported. Do NOT list questions you could not answer, information you lacked, or prompts you left out — those are not claims. Only list something you actually wrote and could not support. Normally empty.'
    )
});

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('Missing env var: ANTHROPIC_API_KEY');
    }
    client = new Anthropic();
  }
  return client;
}

export function anthropicProvider(modelOverride?: string): ModelProvider {
  // The override exists so scripts/compare-models.ts can price several tiers in
  // one process. Nothing in the app passes it — production reads ANTHROPIC_MODEL.
  const model = modelOverride || MODEL;

  return {
    name: 'anthropic',
    model,
    sendsDataOffMachine: true,

    async health() {
      if (!process.env.ANTHROPIC_API_KEY) {
        return { ok: false, detail: 'ANTHROPIC_API_KEY is not set.' };
      }
      return { ok: true, detail: `Configured for ${model}.` };
    },

    async generate(system: string, userMessage: string): Promise<DraftResult> {
      const started = Date.now();

      // Distinguish "never configured" from "the call failed". Without this the
      // missing key falls into the catch below and a DSP is told the draft
      // failed, which sounds like a bug in the app rather than a setup step
      // nobody has done yet. `unavailable` is the reason the UI renders as a
      // warning with "write it manually for now" instead of an error.
      if (!process.env.ANTHROPIC_API_KEY) {
        return {
          ok: false,
          reason: 'unavailable',
          model,
          message:
            'The note assistant has not been set up yet — an administrator needs to add an API key. Everything else works; write the note yourself for now.'
        };
      }

      try {
        // The system prompt is a fixed prefix marked with cache_control, so
        // after the first call the style guide and exemplar are served from
        // cache rather than re-billed on every note. Keep everything variable
        // in userMessage — interpolating a name or date into the system prompt
        // would silently invalidate the cache on every request.
        const effort = effortFor(model);
        const request = (withEffort: boolean) => ({
          model,
          max_tokens: 4000,
          output_config: {
            ...(withEffort && effort ? { effort } : {}),
            format: zodOutputFormat(NoteDraftSchema)
          },
          system: [
            {
              type: 'text' as const,
              text: system,
              cache_control: { type: 'ephemeral' as const }
            }
          ],
          messages: [{ role: 'user' as const, content: userMessage }]
        });

        const client = getClient();
        let response;
        try {
          response = await client.messages.parse(request(true), {
            timeout: DRAFT_TIMEOUT_MS,
            maxRetries: 1
          });
        } catch (err) {
          // A model this table has not met may reject the effort setting.
          // Retry without it rather than failing the draft.
          const message = err instanceof Error ? err.message : String(err);
          if (!/effort/i.test(message)) throw err;
          response = await client.messages.parse(request(false), {
            timeout: DRAFT_TIMEOUT_MS,
            maxRetries: 1
          });
        }

        const usage = {
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          cacheReadTokens: response.usage?.cache_read_input_tokens ?? null,
          cacheWriteTokens: response.usage?.cache_creation_input_tokens ?? null,
          elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1))
        };

        // Check stop_reason before touching content: on a refusal, content is
        // empty or partial and reading it would throw or return a fragment.
        if (response.stop_reason === 'refusal') {
          return {
            ok: false,
            reason: 'refusal',
            model,
            message: 'The model declined this request. Please write the note manually.'
          };
        }

        const draft = response.parsed_output;
        if (!draft || !draft.narrative?.trim()) {
          return {
            ok: false,
            reason: 'empty',
            model,
            message: 'The model returned an empty note. Please write it manually.'
          };
        }

        return { ok: true, draft, usage, model };
      } catch (err) {
        console.error('[ai] anthropic generation failed', err);
        return {
          ok: false,
          reason: 'error',
          model,
          message: 'Could not generate a draft right now. Please write the note manually.'
        };
      }
    },

    /**
     * Extract structured data against a caller-supplied schema.
     *
     * Used by the roster importer. Previously only the OpenAI adapter had this,
     * so removing that adapter would have left the intended production
     * provider unable to read a pasted list at all.
     *
     * The schema arrives as plain JSON Schema rather than zod, because it is
     * defined by the caller, and goes out as a json_schema output format.
     */
    async generateStructured<T>(
      system: string,
      userMessage: string,
      schema: Record<string, unknown>,
      schemaName: string
    ): Promise<StructuredResult<T>> {
      const started = Date.now();

      if (!process.env.ANTHROPIC_API_KEY) {
        return { ok: false, message: 'The assistant has not been set up yet.' };
      }

      try {
        // Structured output rather than a forced tool call: the 5.5 models
        // reject tool_choice "tool" with a 400, which would have broken this
        // quietly the day the model id changed.
        const response = await getClient().messages.create({
          model,
          max_tokens: 4000,
          system,
          output_config: {
            format: { type: 'json_schema', schema }
          },
          messages: [{ role: 'user', content: userMessage }]
        } as Anthropic.MessageCreateParamsNonStreaming);

        if (response.stop_reason === 'refusal') {
          return { ok: false, message: 'The model declined this request.' };
        }
        const text = response.content.find((c) => c.type === 'text');
        if (!text || text.type !== 'text') {
          return { ok: false, message: 'The model returned nothing usable.' };
        }
        let data: T;
        try {
          data = JSON.parse(text.text) as T;
        } catch {
          return { ok: false, message: 'The model returned nothing usable.' };
        }

        return {
          ok: true,
          data,
          usage: {
            inputTokens: response.usage?.input_tokens ?? null,
            outputTokens: response.usage?.output_tokens ?? null,
            cacheReadTokens: response.usage?.cache_read_input_tokens ?? null,
            cacheWriteTokens: response.usage?.cache_creation_input_tokens ?? null,
            elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1))
          }
        };
      } catch (err) {
        console.error('[ai] anthropic structured extraction failed', err);
        return { ok: false, message: 'Could not read that list right now.' };
      }
    }
  };
}
