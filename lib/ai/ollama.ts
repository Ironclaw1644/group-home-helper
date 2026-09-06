import 'server-only';

import http from 'node:http';
import https from 'node:https';
import {
  coerceDraft,
  NOTE_DRAFT_SCHEMA,
  type DraftResult,
  type ModelProvider,
  type StructuredResult
} from './provider';

/**
 * Local model provider (Ollama).
 *
 * This is the default. Everything runs on the operator's own machine, so
 * resident names, Medicaid IDs, and shift narratives never leave the building
 * — which means no BAA with any vendor and no per-note cost.
 *
 * Measured on the reference machine with a 9B qwen3.5 build and reasoning off:
 * roughly 15s for the first note after a cold load, then 6–8s while the model
 * stays resident. Reasoning mode is off deliberately — with it enabled the
 * same model took over seven minutes per note, which no DSP will wait for.
 */

const DEFAULT_HOST = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen3.5-9b-64k';

export function ollamaHost(): string {
  return (process.env.OLLAMA_HOST || DEFAULT_HOST).replace(/\/$/, '');
}

export function ollamaModel(): string {
  return process.env.OLLAMA_MODEL || DEFAULT_MODEL;
}

/**
 * Keep the model resident between notes. A DSP writing four notes in a row
 * should pay the load cost once, not four times.
 */
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || '30m';

/**
 * Reasoning models burn minutes on chain-of-thought before answering, which is
 * unusable mid-shift. Set OLLAMA_THINK=true only if you have measured that
 * your model and hardware can afford it.
 */
const THINK = process.env.OLLAMA_THINK === 'true';

type OllamaResponse = {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
};

/**
 * Raw http rather than fetch: undici caps time-to-headers at five minutes, and
 * a cold load of a large model on modest hardware can exceed that. This app is
 * meant to be downloaded and run on whatever machine the office has.
 */
function request(path: string, payload: unknown, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(ollamaHost() + path);
    const transport = url.protocol === 'https:' ? https : http;
    const data = JSON.stringify(payload);

    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data)
        }
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );

    // A single overall deadline, rather than an idle timeout, so a slow-but-
    // progressing generation is not killed halfway through a note.
    const timer = setTimeout(() => {
      req.destroy(new Error('timeout'));
    }, timeoutMs);

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.on('close', () => clearTimeout(timer));

    req.write(data);
    req.end();
  });
}

function get(path: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(ollamaHost() + path);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    const timer = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs);
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.on('close', () => clearTimeout(timer));
  });
}

const GENERATION_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 180_000);

export function ollamaProvider(): ModelProvider {
  const model = ollamaModel();

  return {
    name: 'local',
    model,
    sendsDataOffMachine: false,

    async health() {
      try {
        const res = await get('/api/tags', 5_000);
        if (res.status !== 200) {
          return { ok: false, detail: `Ollama responded with ${res.status}.` };
        }
        const tags = JSON.parse(res.body) as { models?: Array<{ name: string }> };
        const installed = (tags.models ?? []).map((m) => m.name);

        // Ollama reports "qwen3.5:9b"; accept a bare "qwen3.5" too.
        const found = installed.some((n) => n === model || n.split(':')[0] === model.split(':')[0]);

        if (!found) {
          return {
            ok: false,
            detail: `Model "${model}" is not installed. Run: ollama pull ${model}`
          };
        }
        return { ok: true, detail: `Ollama is running with ${model}.` };
      } catch {
        return {
          ok: false,
          detail: `Cannot reach Ollama at ${ollamaHost()}. Start it with: ollama serve`
        };
      }
    },

    async generate(system: string, userMessage: string): Promise<DraftResult> {
      const started = Date.now();

      let res: { status: number; body: string };
      try {
        res = await request(
          '/api/chat',
          {
            model,
            stream: false,
            // Constrained decoding against the same schema the hosted path
            // uses, so both providers return the same shape.
            format: NOTE_DRAFT_SCHEMA,
            keep_alive: KEEP_ALIVE,
            think: THINK,
            options: {
              // Low but not zero: notes should read naturally without the
              // model wandering off the recorded facts.
              temperature: 0.3,
              num_ctx: 8192
            },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: userMessage }
            ]
          },
          GENERATION_TIMEOUT_MS
        );
      } catch (err) {
        const timedOut = err instanceof Error && err.message === 'timeout';
        return {
          ok: false,
          reason: 'unavailable',
          model,
          message: timedOut
            ? 'The local model took too long to respond. You can write the note manually, or try a smaller model.'
            : `Cannot reach the local model at ${ollamaHost()}. Make sure Ollama is running.`
        };
      }

      if (res.status !== 200) {
        return {
          ok: false,
          reason: 'error',
          model,
          message: `The local model returned an error (${res.status}). You can still write the note manually.`
        };
      }

      let body: OllamaResponse;
      try {
        body = JSON.parse(res.body) as OllamaResponse;
      } catch {
        return {
          ok: false,
          reason: 'error',
          model,
          message: 'Could not read the local model response. Please write the note manually.'
        };
      }

      if (body.error) {
        return { ok: false, reason: 'error', model, message: body.error };
      }

      const draft = coerceDraft(body.message?.content ?? '');
      if (!draft) {
        return {
          ok: false,
          reason: 'empty',
          model,
          message: 'The local model returned an empty note. Please write it manually.'
        };
      }

      return {
        ok: true,
        draft,
        model,
        usage: {
          inputTokens: body.prompt_eval_count ?? null,
          outputTokens: body.eval_count ?? null,
          cacheReadTokens: null,
          elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1))
        }
      };
    },

    /**
     * Extract structured data against a caller-supplied schema.
     *
     * Ollama takes a JSON Schema in `format` and constrains decoding to it, so
     * this is the same mechanism generate() already uses for the note draft —
     * no prompt-and-hope parsing.
     *
     * This exists because it was previously implemented only on the OpenAI
     * adapter. With that removed, the roster importer would have had no
     * provider at all that could read a pasted list, on the provider that is
     * now the default.
     */
    async generateStructured<T>(
      system: string,
      userMessage: string,
      schema: Record<string, unknown>,
      _schemaName: string
    ): Promise<StructuredResult<T>> {
      const started = Date.now();

      let res: { status: number; body: string };
      try {
        res = await request(
          '/api/chat',
          {
            model,
            stream: false,
            format: schema,
            keep_alive: KEEP_ALIVE,
            think: THINK,
            options: {
              // Extraction, not composition: the answer is in the text or it
              // is not, so temperature buys nothing and costs accuracy.
              temperature: 0,
              // A full house roster with the surrounding prose it was pasted
              // from does not fit in the 8k used for a single note.
              num_ctx: 16384
            },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: userMessage }
            ]
          },
          GENERATION_TIMEOUT_MS
        );
      } catch (err) {
        const timedOut = err instanceof Error && err.message === 'timeout';
        return {
          ok: false,
          message: timedOut
            ? 'The local model took too long to read that list.'
            : `Cannot reach the local model at ${ollamaHost()}.`
        };
      }

      if (res.status !== 200) {
        return { ok: false, message: `The local model returned an error (${res.status}).` };
      }

      let body: OllamaResponse;
      try {
        body = JSON.parse(res.body) as OllamaResponse;
      } catch {
        return { ok: false, message: 'Could not read the local model response.' };
      }

      if (body.error) return { ok: false, message: body.error };

      try {
        const data = JSON.parse(body.message?.content ?? '') as T;
        if (!data || typeof data !== 'object') {
          return { ok: false, message: 'The local model returned nothing usable.' };
        }
        return {
          ok: true,
          data,
          usage: {
            inputTokens: body.prompt_eval_count ?? null,
            outputTokens: body.eval_count ?? null,
            cacheReadTokens: null,
            elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1))
          }
        };
      } catch {
        return { ok: false, message: 'The local model returned malformed JSON.' };
      }
    }
  };
}
