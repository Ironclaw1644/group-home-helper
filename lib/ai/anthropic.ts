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
 * so it requires signed BAAs with Anthropic and your host — see README. The
 * default provider is local, which needs none of that.
 *
 * This is the intended production path once those agreements exist. It is the
 * only hosted provider: the OpenAI adapter was removed because production was
 * running on it without a BAA.
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
 * `medium` keeps latency reasonable for a DSP waiting on a phone mid-shift.
 *
 * Not every model accepts an effort setting, and passing it to one that does
 * not is a 400 that would read to a DSP as "draft failed". generate() retries
 * once without it rather than surfacing that.
 */
const EFFORT = 'medium' as const;

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
        const request = (withEffort: boolean) => ({
          model,
          max_tokens: 4000,
          output_config: {
            ...(withEffort ? { effort: EFFORT } : {}),
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
          response = await client.messages.parse(request(true));
        } catch (err) {
          // Models that do not accept an effort setting reject the whole
          // request. Retry without it rather than failing the draft.
          const message = err instanceof Error ? err.message : String(err);
          if (!/effort/i.test(message)) throw err;
          response = await client.messages.parse(request(false));
        }

        const usage = {
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          cacheReadTokens: response.usage?.cache_read_input_tokens ?? null,
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
     * defined by the caller. `messages.create` with a forced tool call is the
     * path that accepts one.
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
        const response = await getClient().messages.create({
          model,
          max_tokens: 4000,
          system,
          tools: [
            {
              name: schemaName,
              description: 'Return the extracted data.',
              input_schema: schema as unknown as Anthropic.Tool['input_schema']
            }
          ],
          // Forced, so the model answers with the schema rather than prose
          // about the schema.
          tool_choice: { type: 'tool', name: schemaName },
          messages: [{ role: 'user', content: userMessage }]
        });

        const block = response.content.find((c) => c.type === 'tool_use');
        if (!block || block.type !== 'tool_use') {
          return { ok: false, message: 'The model returned nothing usable.' };
        }

        return {
          ok: true,
          data: block.input as T,
          usage: {
            inputTokens: response.usage?.input_tokens ?? null,
            outputTokens: response.usage?.output_tokens ?? null,
            cacheReadTokens: response.usage?.cache_read_input_tokens ?? null,
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
