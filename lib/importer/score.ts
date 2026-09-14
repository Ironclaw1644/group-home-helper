/**
 * Score an imported draft against a golden spec (docs/golden/*.json).
 *
 * SPIKE — spike/form-importer. Strict on purpose: a prompt matches only if it
 * is character-for-character equal to the state's wording once runs of
 * whitespace are collapsed to one space. A near-miss is a miss.
 */
import { printedSources, type DraftTemplate } from './template-draft';

export type GoldenSpec = {
  title: string;
  form_number: string | null;
  prompts_verbatim: string[];
  required_identity_fields: string[];
};

export type GoldenScore = {
  matchedDraftName: string | null;
  promptsMatched: number;
  promptsTotal: number;
  promptMisses: { want: string; closest: string | null }[];
  identityFound: string[];
  identityMissing: string[];
  formNumberNull: boolean;
};

export function scoreAgainstGolden(drafts: DraftTemplate[], golden: GoldenSpec): GoldenScore {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const draft = drafts.find((d) => norm(d.name) === norm(golden.title)) ?? drafts.find((d) => norm(d.name).includes(norm(golden.title))) ?? null;

  const prompts = draft?.schema.prompts ?? [];
  const promptMisses: GoldenScore['promptMisses'] = [];
  let promptsMatched = 0;
  for (const want of golden.prompts_verbatim) {
    if (prompts.includes(want)) promptsMatched++;
    else {
      const closest = prompts.find((p) => norm(p).slice(0, 20) === norm(want).slice(0, 20)) ?? null;
      promptMisses.push({ want, closest });
    }
  }

  const sources = draft ? printedSources(draft) : new Set<string>();
  return {
    matchedDraftName: draft?.name ?? null,
    promptsMatched,
    promptsTotal: golden.prompts_verbatim.length,
    promptMisses,
    identityFound: golden.required_identity_fields.filter((f) => sources.has(f)),
    identityMissing: golden.required_identity_fields.filter((f) => !sources.has(f)),
    formNumberNull: draft ? draft.form_number === null : false
  };
}
