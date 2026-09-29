/**
 * Paths 2 and 3, the offline half: phrasing presets.
 *
 * SPIKE — spike/form-importer. Pure: no network, no database.
 *
 * Path 2 — "what we usually write" — is the agency describing its own phrasing.
 * Path 3 — photos of notes already written — is patient information and only
 * runs behind path3Gate (phi-gate.ts). Both produce DRAFT presets that a
 * supervisor approves before a DSP can pick them.
 *
 * Two rules, enforced here rather than trusted to a prompt:
 *   1. Grounded. A preset's words must come from what the client gave us. A
 *      model that "helpfully" adds clinical content ("no signs of
 *      dehydration") produces a preset that is dropped, not softened.
 *   2. De-identified (Path 3). Names, dates, times, IDs, phone numbers, emails
 *      and addresses are replaced with placeholders. If anything that still
 *      looks like an identifier survives, the preset is dropped. Fail closed.
 */
import type { GateResult } from './phi-gate';

export type PresetOrigin = 'described' | 'note_photo' | 'user';

export type DraftPreset = {
  id: string;
  org_id: string;
  label: string;
  text: string;
  category: string | null;
  origin: PresetOrigin;
  status: 'pending_approval' | 'approved';
};

export type RawPreset = { label: string; text: string; category: string | null };

export type DroppedPreset = { preset: RawPreset; why: string };

// ---------------------------------------------------------------------------
// Grounding
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  'a an and are as at be been but by did do for from had has have he her him his i if in into is it its of on or our she so that the their them then there they this to up was we were with you your'.split(
    ' '
  )
);

const PLACEHOLDER = /\{(name|subject|date|time|id|phone|email|address)\}/g;

function contentWords(text: string): string[] {
  return (
    text
      .replace(PLACEHOLDER, ' ')
      .toLowerCase()
      .match(/[a-z][a-z'-]*/g)
      ?.filter((w) => !STOPWORDS.has(w) && w.length > 2) ?? []
  );
}

/** Light stemming so "prompted"/"prompts"/"prompting" count as one word. */
function stem(w: string): string {
  return w.replace(/(ing|ed|es|s|ly)$/, '');
}

/**
 * The share of a preset's content words that appear in the source text. Word
 * order and small inflections may change; new content words may not.
 */
export function groundedness(presetText: string, source: string): number {
  const words = contentWords(presetText);
  if (words.length === 0) return 1;
  const have = new Set(contentWords(source).map(stem));
  return words.filter((w) => have.has(stem(w))).length / words.length;
}

export const GROUNDING_THRESHOLD = 0.85;

let seq = 0;
const nextId = (origin: PresetOrigin) => `draft-${origin}-${++seq}`;

function toDraft(p: RawPreset, orgId: string, origin: PresetOrigin): DraftPreset {
  return {
    id: nextId(origin),
    org_id: orgId,
    label: p.label.trim(),
    text: p.text.replace(/\s+/g, ' ').trim(),
    category: p.category?.trim() || null,
    origin,
    status: 'pending_approval'
  };
}

// ---------------------------------------------------------------------------
// Path 2
// ---------------------------------------------------------------------------

export function presetsFromDescription(
  raw: RawPreset[],
  description: string,
  orgId: string
): { presets: DraftPreset[]; dropped: DroppedPreset[] } {
  const presets: DraftPreset[] = [];
  const dropped: DroppedPreset[] = [];
  for (const p of raw) {
    if (!p.text.trim()) continue;
    const g = groundedness(p.text, description);
    if (g < GROUNDING_THRESHOLD) {
      dropped.push({ preset: p, why: `only ${Math.round(g * 100)}% of its words came from what you wrote` });
      continue;
    }
    presets.push(toDraft(p, orgId, 'described'));
  }
  return { presets, dropped };
}

// ---------------------------------------------------------------------------
// Path 3 — de-identification
// ---------------------------------------------------------------------------

const MONTHS =
  'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';

const RULES: [RegExp, string][] = [
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '{email}'],
  [/\b\d{3}-\d{2}-\d{4}\b/g, '{id}'],
  [/(\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '{phone}'],
  [new RegExp(`\\b(${MONTHS})\\.?\\s+\\d{1,2}(st|nd|rd|th)?(,?\\s+\\d{2,4})?\\b`, 'g'), '{date}'],
  [/\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b/g, '{date}'],
  [/\b\d{4}-\d{2}-\d{2}\b/g, '{date}'],
  [/\b\d{1,2}(:\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/gi, '{time}'],
  [/\b\d{1,2}\s*(am|pm|a\.m\.|p\.m\.)/gi, '{time}'],
  [/\b\d+\s+[A-Z][a-z]+(\s[A-Z][a-z]+)?\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Boulevard|Blvd)\b\.?/g, '{address}'],
  // Anything with 4+ digits, or letters and digits mixed, is an identifier until proven otherwise.
  [/\b(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]{4,}\b/g, '{id}'],
  [/\b(Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z][a-z]+/g, '{name}']
];

/** Capitalised words that are not identifiers when they appear mid-sentence. */
const CAPITALISED_OK = new Set(
  (
    'I DSP DSPs Staff RN LPN QIDP PRN AM PM Monday Tuesday Wednesday Thursday Friday Saturday Sunday ' +
    'He She They His Her Their Him Them'
  ).split(' ')
);

export function deidentifyPhrasing(text: string, knownNames: string[] = []): string {
  let out = text;
  // Longest first so "Mary Ann" is replaced before "Mary".
  for (const name of [...knownNames].filter((n) => n.trim().length > 1).sort((a, b) => b.length - a.length)) {
    const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}('s)?\\b`, 'gi'), (_m, poss) => `{name}${poss ?? ''}`);
  }
  for (const [re, placeholder] of RULES) out = out.replace(re, placeholder);
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * What still looks like it could identify someone after de-identification:
 * any digit, or a capitalised word that does not start a sentence and is not on
 * the short allowlist. Deliberately over-eager — a dropped preset costs a
 * supervisor a minute; a leaked name costs a breach report.
 */
export function residualIdentifiers(text: string): string[] {
  const stripped = text.replace(PLACEHOLDER, ' ');
  const hits: string[] = [];
  if (/\d/.test(stripped)) hits.push(...(stripped.match(/\S*\d\S*/g) ?? []));
  const tokens = stripped.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i].replace(/^[("'“]+|[)"'”.,;:!?]+$/g, '');
    if (!/^[A-Z][a-z]/.test(word)) continue;
    const prev = tokens[i - 1] ?? '';
    const sentenceStart = i === 0 || /[.!?:]["'”)]?$/.test(prev);
    if (sentenceStart || CAPITALISED_OK.has(word)) continue;
    hits.push(word);
  }
  return hits;
}

export function presetsFromNotePhotos(
  raw: RawPreset[],
  opts: {
    orgId: string;
    gate: GateResult;
    /** Transcribed note text, used for grounding. Never stored. */
    transcript: string;
    /** Names the model read off the notes, stripped before anything is kept. */
    namesSeen: string[];
  }
): { presets: DraftPreset[]; dropped: DroppedPreset[] } {
  // Checked again here, not only at the route: a caller that forgets the gate
  // must not be able to produce presets from a patient's note.
  if (!opts.gate.allowed) {
    throw new Error(`Path 3 refused: ${opts.gate.reasons.join(', ')}`);
  }
  const presets: DraftPreset[] = [];
  const dropped: DroppedPreset[] = [];
  const groundingSource = deidentifyPhrasing(opts.transcript, opts.namesSeen);
  for (const p of raw) {
    const text = deidentifyPhrasing(p.text, opts.namesSeen);
    const label = deidentifyPhrasing(p.label, opts.namesSeen);
    const leftovers = [...residualIdentifiers(text), ...residualIdentifiers(label)];
    if (leftovers.length) {
      // The leftover itself may be an identifier, so it is counted, not quoted.
      dropped.push({ preset: { ...p, text: '[withheld]', label: '[withheld]' }, why: `${leftovers.length} possible identifier(s) survived de-identification` });
      continue;
    }
    const g = groundedness(text, groundingSource);
    if (g < GROUNDING_THRESHOLD) {
      dropped.push({ preset: { ...p, text, label }, why: `only ${Math.round(g * 100)}% of its words appear in the notes` });
      continue;
    }
    presets.push(toDraft({ label, text, category: p.category }, opts.orgId, 'note_photo'));
  }
  return { presets, dropped };
}

/** A preset a supervisor types in by hand. Still a draft until approved. */
export function userPreset(label: string, text: string, orgId: string, category: string | null = null): DraftPreset {
  return toDraft({ label, text, category }, orgId, 'user');
}
