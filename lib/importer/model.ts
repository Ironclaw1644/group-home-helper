import 'server-only';

/**
 * The network half of the importer: the only file here that talks to a model.
 *
 * Reads nothing from and writes nothing to the database. Every decision about
 * what a template or preset may contain is made afterwards by the pure modules
 * (template-draft.ts, editable.ts, presets.ts); this file only asks the model
 * to transcribe.
 *
 * Uses Anthropic because it is the one hosted provider this app keeps (see
 * lib/ai/anthropic.ts). A BLANK form carries no patient information, so Paths 1
 * and 2 need no BAA. Path 3 does, and readNotePhotos checks the gate before any
 * byte leaves the machine.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { PRINT_SOURCES } from '../types';
import type { GateResult } from './phi-gate';
import type { RawPreset } from './presets';
import type { RawExtraction } from './template-draft';

/**
 * Opus 5.5, measured against Sonnet 5.5 on West Virginia's official form
 * (scripts/fixtures/importer, 2026-09-29): both copied all four printed
 * questions verbatim; only Opus also found every printed field from the photo
 * pages (5 of the 5 the form prints — Sonnet missed "Time"). About $0.07 and
 * 20 s per import against $0.03 and 10 s, once per agency. Accuracy first.
 */
export const IMPORTER_MODEL = process.env.ANTHROPIC_IMPORTER_MODEL || 'claude-opus-5-5';

/** Reading a page is transcription, not reasoning; medium is Opus 5.5's own default, stated. */
const IMPORTER_EFFORT = 'medium' as const;

/** Past this the admin has been watching a spinner long enough; they can retry. */
const IMPORT_TIMEOUT_MS = 100_000;

export type UploadMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';
export type Upload = { mediaType: UploadMediaType; base64: string };

export type Usage = { model: string; inputTokens: number; outputTokens: number; elapsedSeconds: number };

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing env var: ANTHROPIC_API_KEY');
  client ??= new Anthropic();
  return client;
}

function toBlocks(uploads: Upload[]): Anthropic.ContentBlockParam[] {
  return uploads.flatMap((u, i): Anthropic.ContentBlockParam[] => [
    { type: 'text', text: `Upload page ${i + 1}:` },
    u.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: u.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: u.mediaType, data: u.base64 } }
  ]);
}

// ---------------------------------------------------------------------------
// Path 1 — blank forms
// ---------------------------------------------------------------------------

const FormSchema = z.object({
  forms: z.array(
    z.object({
      title: z.string().describe('The form title exactly as printed (the most specific title line).'),
      subtitle: z.string().nullable().describe('Any parenthetical or subtitle under the title, verbatim.'),
      pages: z.array(z.number().int()).describe('1-based upload pages this form occupies.'),
      printed_form_numbers: z
        .array(z.string())
        .describe(
          'Every string printed anywhere on these pages (including headers and footers) that looks like a form number, document code or revision identifier, verbatim. Empty if none. Never infer one from a title or filename.'
        ),
      prompt_blocks_verbatim: z
        .array(z.string())
        .describe(
          'Questions or instructions printed for the writer to answer in narrative, copied character for character. Do not reword, split, merge, correct, or substitute names. Print each separately printed block once, even if the form repeats it on several rows.'
        ),
      fields: z.array(
        z.object({
          label: z.string().describe('The field label exactly as printed.'),
          suggested_source: z
            .string()
            .nullable()
            .describe(`One of: ${PRINT_SOURCES.join(', ')} — only if the label clearly asks for that value. Otherwise null.`),
          section: z.enum(['identity', 'meta', 'signature', 'other'])
        })
      ),
      is_log_or_table: z
        .boolean()
        .describe('True for time sheets, service logs, mileage logs and other tabular forms; false for narrative notes.')
    })
  )
});

const FORM_SYSTEM = `You transcribe blank paper forms used by care providers so software can reproduce them.

An upload may contain more than one distinct form. Return each distinct form separately, in page order.

Accuracy rules:
- Copy printed text exactly. Never paraphrase, never fix grammar or spacing inside a sentence, never replace generic words like "the person" with anything else.
- Report only what is printed. If a value is not printed, leave it out or null. Guessing a form number is the worst error you can make.
- For fields, list each distinct labelled blank once. identity = who the record is about and which provider; meta = date, time, staff; signature = signature lines.`;

export async function extractForms(uploads: Upload[]): Promise<{ raw: RawExtraction; usage: Usage }> {
  const started = Date.now();
  const response = await getClient().messages.parse(
    {
    model: IMPORTER_MODEL,
    max_tokens: 16000,
    output_config: { effort: IMPORTER_EFFORT, format: zodOutputFormat(FormSchema) },
    system: FORM_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [...toBlocks(uploads), { type: 'text', text: 'Transcribe every form in this upload.' }]
      }
    ]
    },
    { timeout: IMPORT_TIMEOUT_MS, maxRetries: 1 }
  );
  if (response.stop_reason === 'refusal') throw new Error('model refused the form upload');
  if (!response.parsed_output) throw new Error(`no parsed output (stop_reason=${response.stop_reason})`);
  return { raw: response.parsed_output, usage: usageOf(response, started) };
}

// ---------------------------------------------------------------------------
// Path 2 — "what we usually write"
// ---------------------------------------------------------------------------

const PresetSchema = z.object({
  presets: z.array(
    z.object({
      label: z.string().describe('A short picker label, 2-5 words, taken from the text.'),
      text: z.string().describe("A reusable phrase in the agency's own words. Use {name} where a person's name goes."),
      category: z.string().nullable()
    })
  )
});

const PRESET_SYSTEM = `You turn an agency's description of what their staff commonly write into reusable phrase presets.

Use only the agency's own wording. Do not add clinical observations, outcomes, symptoms or judgements that the agency did not write. If they wrote a phrase, keep it; you may trim it and put {name} where a person's name goes. Fewer faithful presets are better than many embellished ones.`;

export async function extractPresetsFromDescription(description: string): Promise<{ raw: RawPreset[]; usage: Usage }> {
  const started = Date.now();
  const response = await getClient().messages.parse({
    model: IMPORTER_MODEL,
    max_tokens: 8000,
    output_config: { format: zodOutputFormat(PresetSchema) },
    system: PRESET_SYSTEM,
    messages: [{ role: 'user', content: description }]
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) throw new Error('no presets returned');
  return { raw: response.parsed_output.presets, usage: usageOf(response, started) };
}

// ---------------------------------------------------------------------------
// Path 3 — photos of written notes (gated)
// ---------------------------------------------------------------------------

const NoteSchema = z.object({
  transcript: z.string().describe('The handwritten or typed note text, transcribed.'),
  names_seen: z.array(z.string()).describe('Every personal name, nickname or initials that appear in the notes.'),
  presets: z.array(
    z.object({
      label: z.string(),
      text: z
        .string()
        .describe('A recurring phrasing pattern from the notes, with names, dates, times and numbers replaced by {name}, {date}, {time}, {id}.'),
      category: z.string().nullable()
    })
  )
});

const NOTE_SYSTEM = `You read progress notes an agency has already written and extract the phrasing patterns their staff reuse.

Presets are patterns, not records: replace every name, date, time, ID, place and number with {name}, {date}, {time} or {id}. Use only wording that appears in the notes. Do not add clinical content.`;

export async function readNotePhotos(
  uploads: Upload[],
  gate: GateResult
): Promise<{ transcript: string; namesSeen: string[]; raw: RawPreset[]; usage: Usage }> {
  // Before the client is even constructed: nothing is sent unless both halves
  // of the gate hold.
  if (!gate.allowed) throw new Error(`Path 3 refused: ${gate.reasons.join(', ')}`);
  const started = Date.now();
  const response = await getClient().messages.parse({
    model: IMPORTER_MODEL,
    max_tokens: 8000,
    output_config: { format: zodOutputFormat(NoteSchema) },
    system: NOTE_SYSTEM,
    messages: [{ role: 'user', content: [...toBlocks(uploads), { type: 'text', text: 'Extract phrasing presets.' }] }]
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) throw new Error('no note reading returned');
  const out = response.parsed_output;
  return { transcript: out.transcript, namesSeen: out.names_seen, raw: out.presets, usage: usageOf(response, started) };
}

function usageOf(response: { usage?: { input_tokens: number; output_tokens: number } }, started: number): Usage {
  return {
    model: IMPORTER_MODEL,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1))
  };
}
