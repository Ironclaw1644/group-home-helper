import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
// The SDK's zodOutputFormat helper is typed against the v4 API, exposed by
// zod 3.25+ on this subpath. Request validation elsewhere in the app uses the
// classic `zod` import; the two coexist deliberately.
import * as z from 'zod/v4';
import type { DraftResult, ModelProvider } from './provider';

/**
 * Hosted provider (Anthropic).
 *
 * Opt in with AI_PROVIDER=anthropic. This sends note content off the machine,
 * so it requires signed BAAs with Anthropic and your host — see README. The
 * default provider is local, which needs none of that.
 */

export const MODEL = 'claude-opus-5';

/**
 * The note is a short paragraph in a well-specified voice, and Opus 5 is
 * strong at low/medium effort. `medium` keeps latency reasonable for a DSP
 * waiting on a phone mid-shift; raise it if drafts start missing detail.
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
    .describe('Anything in the narrative not directly supported by the input. Should be empty.')
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

export function anthropicProvider(): ModelProvider {
  return {
    name: 'anthropic',
    model: MODEL,
    sendsDataOffMachine: true,

    async health() {
      if (!process.env.ANTHROPIC_API_KEY) {
        return { ok: false, detail: 'ANTHROPIC_API_KEY is not set.' };
      }
      return { ok: true, detail: `Configured for ${MODEL}.` };
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
          model: MODEL,
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
        const response = await getClient().messages.parse({
          model: MODEL,
          max_tokens: 4000,
          output_config: {
            effort: EFFORT,
            format: zodOutputFormat(NoteDraftSchema)
          },
          system: [
            {
              type: 'text',
              text: system,
              cache_control: { type: 'ephemeral' }
            }
          ],
          messages: [{ role: 'user', content: userMessage }]
        });

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
            model: MODEL,
            message: 'The model declined this request. Please write the note manually.'
          };
        }

        const draft = response.parsed_output;
        if (!draft || !draft.narrative?.trim()) {
          return {
            ok: false,
            reason: 'empty',
            model: MODEL,
            message: 'The model returned an empty note. Please write it manually.'
          };
        }

        return { ok: true, draft, usage, model: MODEL };
      } catch (err) {
        console.error('[ai] anthropic generation failed', err);
        return {
          ok: false,
          reason: 'error',
          model: MODEL,
          message: 'Could not generate a draft right now. Please write the note manually.'
        };
      }
    }
  };
}
