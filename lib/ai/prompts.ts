/**
 * Prompts for note drafting.
 *
 * IMPORTANT — prompt caching: everything in SYSTEM_PROMPT is a fixed prefix
 * sent on every call and marked with cache_control. It must stay byte-identical
 * between requests, so nothing resident-specific, nothing dated, and nothing
 * interpolated may appear here. Per-note facts go in the user message.
 */

/**
 * Style anchor, derived from the agency's own completed Form #680 in
 * EE/detail.jpg.
 *
 * These are sentence *patterns*, not a filled-in note, and that is deliberate.
 * An earlier version used the real exemplar verbatim; smaller local models
 * pattern-completed from it and pasted its events into unrelated notes —
 * "a nutritious dinner was served and enjoyed" on a shift where no meal was
 * recorded, which is a falsified record. Skeletons carry the register with
 * nothing liftable in them.
 */
const STYLE_PATTERNS = [
  '[Name] was observed [state].',
  'Staff prompted [Name] to [activity], where [subject] [outcome].',
  '[Name] was supported by staff in [task], which [subject] [reaction].',
  '[Name] was transported to [place] where [subject] enjoyed [activity].',
  '[Name] chose to [activity] and [outcome].',
  '[Name] engaged in [activity] with staff.',
  'Staff [support action], and [Name] [outcome].'
]
  // Every pattern must contain at least one slot. A fully written-out sentence
  // gets lifted verbatim into notes where it did not happen — an earlier draft
  // included "[Name] engaged in conversation with staff." and the model used
  // it on shifts where no conversation was recorded.
  .map((p) => `- ${p}`)
  .join('\n');

export const SYSTEM_PROMPT = `You write Daily Progress Notes (Form #680) for a Medicaid home and community based services provider. A Direct Support Professional records what happened during a shift by selecting from a fixed set of options; your job is to render those selections as the narrative paragraph that goes on the form.

This note is part of a resident's medical record and is the billing substantiation for the shift. An auditor may read it years from now.

## The one rule that matters

You may only describe events that appear in the structured input you are given.

Do not invent, infer, embellish, or "round out" anything. Specifically, never add:
- activities, outings, or destinations that were not selected
- meals, foods, or intake amounts that were not recorded
- times of day, durations, or sequences that were not provided
- quotes, conversations, or statements attributed to anyone
- medical observations, vital signs, symptoms, or clinical judgements
- other people (family, peers, staff by name, visitors, clinicians)
- moods, preferences, or reactions that were not selected

If the input is thin, write a short note. A three-sentence note that is accurate is correct; a full paragraph containing one invented detail is a falsified medical record. When in doubt, leave it out.

## Voice and format

These are the sentence shapes this agency uses. The bracketed slots are
placeholders — fill them only from the recorded input, and only when the input
has something to put there. Do not use a pattern whose slots you cannot fill
from the input.

<style_patterns>
${STYLE_PATTERNS}
</style_patterns>

- Third person, simple past tense.
- Refer to the resident by first name and by the pronouns given in the input. Never guess pronouns.
- Write places and activities in ordinary sentence case with articles: "went to the park", not "went to Park". The input lists them as labels; turn them into prose.
- Plain, factual, warm-but-neutral. No clinical jargon, no bullet points, no headings.
- Describe staff action as support: "Staff prompted...", "[Name] was supported by staff in...", "[Name] was transported to...".
- One paragraph. No line breaks.
- Do not restate the five prompt questions and do not number your sentences.
- Do not open with a date or the shift label; those are printed on the form already.

## The closing sentence

- If the input says the shift had no concerns, end with exactly: There were no problems or concerns during shift.
- If the input says the shift had a concern, do NOT use that sentence. Instead describe the concern plainly in the position it belongs, using only what was recorded, and end the note without a reassuring closer.

## Reporting your own work

Along with the narrative, return:
- entities_used: the specific input items you drew on.
- unsupported_claims: anything in your narrative not directly supported by the input. This should be empty. If you cannot express something without going beyond the input, drop it from the narrative rather than listing it here.`;

export type DraftInput = {
  residentName: string;
  pronouns: { subject: string; object: string; possessive: string };
  shiftLabel: string;
  hasConcern: boolean;
  selections: Array<{ section: string; field: string; promptRef?: number; values: string[] }>;
  prompts: string[];
  /**
   * ISP outcome documentation for this shift, already resolved to labels.
   *
   * Passed separately from `selections` because outcomes carry an explicit
   * negative — "not worked on" is a recorded fact that must suppress the topic,
   * not an absence the model can fill in.
   */
  outcomes?: Array<{
    title: string;
    /**
     * `null` means the DSP has not answered this outcome yet. That is a third
     * state, not a soft "no": telling the model "NOT worked on this shift"
     * would hand it a fact nobody recorded, and the phrasing below keeps the
     * two apart while suppressing the topic either way.
     */
    addressed: boolean | null;
    supportLevel?: string | null;
    progress?: string | null;
    comment?: string | null;
    /**
     * Per-activity yes/no answers, which is the record Virginia actually asks
     * for. A "no" is a documented fact and must be reflected honestly, not
     * softened into silence.
     */
    activities?: Array<{ question: string; answered: boolean; concern: boolean; comment?: string | null }>;
  }>;
};

/** The per-note user message. Everything variable lives here, after the cached prefix. */
export function buildDraftUserMessage(input: DraftInput): string {
  const lines: string[] = [];

  lines.push('<resident>');
  lines.push(`name: ${input.residentName}`);
  lines.push(
    `pronouns: ${input.pronouns.subject}/${input.pronouns.object}/${input.pronouns.possessive}`
  );
  lines.push('</resident>');
  lines.push('');
  lines.push(`<shift>${input.shiftLabel}</shift>`);
  lines.push('');
  lines.push('<form_prompts>');
  input.prompts.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  lines.push('</form_prompts>');
  lines.push('');
  lines.push('<recorded_this_shift>');

  if (input.selections.length === 0) {
    lines.push('(nothing recorded)');
  } else {
    for (const sel of input.selections) {
      const prompt = sel.promptRef ? ` [answers prompt ${sel.promptRef}]` : '';
      // Field label only. Section headings like "Activity and community" are
      // UI grouping, and smaller models will paste them into the prose
      // verbatim ("Alex chose to stay home for activities and community").
      lines.push(`- ${sel.field}${prompt}: ${sel.values.join(', ')}`);
    }
  }

  lines.push('</recorded_this_shift>');

  // ISP outcomes. These are the part a Medicaid reviewer reads for, so the
  // narrative should say what was worked on and how it went — but strictly from
  // what the DSP recorded. An outcome marked "not this shift" must not turn
  // into a sentence claiming it happened.
  if (input.outcomes?.length) {
    lines.push('');
    lines.push('<service_plan_outcomes>');
    for (const o of input.outcomes) {
      if (o.addressed === null) {
        lines.push(`- ${o.title}: no answer recorded. Do not mention it at all.`);
        continue;
      }
      if (!o.addressed) {
        lines.push(`- ${o.title}: NOT worked on this shift. Do not describe it.`);
        continue;
      }
      const parts = [o.supportLevel, o.progress].filter(Boolean);
      lines.push(
        `- ${o.title}: worked on${parts.length ? ` (${parts.join('; ')})` : ''}` +
          (o.comment ? ` — ${o.comment}` : '')
      );

      for (const a of o.activities ?? []) {
        lines.push(
          `    * ${a.question} ${a.answered ? 'YES' : 'NO'}` +
            (a.concern ? ' [concern flagged]' : '') +
            (a.comment ? ` — ${a.comment}` : '')
        );
      }
    }
    lines.push('</service_plan_outcomes>');
  }
  lines.push('');
  lines.push(
    input.hasConcern
      ? '<shift_had_concern>true — do not use the "no problems or concerns" closing sentence.</shift_had_concern>'
      : '<shift_had_concern>false — end with the standard closing sentence.</shift_had_concern>'
  );
  lines.push('');
  lines.push(
    'Write the progress note paragraph using only what is listed above. Nothing else happened that you know of.'
  );

  return lines.join('\n');
}

/**
 * Training-example mode.
 *
 * The client wants a realistic, complete note to hand new staff — one that
 * looks exactly like a real note, because a watermarked sample does not teach
 * anyone what their own note should look like. It is written about a fictional
 * resident, so unlike Draft Assist the model may choose a plausible shift.
 */
export function buildExampleUserMessage(input: {
  residentName: string;
  pronouns: { subject: string; object: string; possessive: string };
  shiftLabel: string;
  prompts: string[];
  variation?: string;
}): string {
  return [
    '<mode>training_example</mode>',
    '',
    'This is a TRAINING EXAMPLE for staff onboarding, written about a fictional resident.',
    'No real person is involved and no service was delivered, so for this request only you may',
    'choose a plausible, ordinary shift rather than working from recorded selections.',
    '',
    'Write it exactly as a strong real note would read: same voice, same length, same level of',
    'specific detail. Do not mention that it is an example, do not add a disclaimer, and do not',
    'hedge the language. Trainees need to see the finished target.',
    '',
    'Depict a routine, unremarkable shift that a new DSP should recognize as the standard:',
    'a normal morning, meals, one community or in-home activity chosen by the resident, and',
    'staff support described as support. End with the standard closing sentence.',
    '',
    '<resident>',
    `name: ${input.residentName}`,
    `pronouns: ${input.pronouns.subject}/${input.pronouns.object}/${input.pronouns.possessive}`,
    '</resident>',
    '',
    `<shift>${input.shiftLabel}</shift>`,
    '',
    '<form_prompts>',
    ...input.prompts.map((p, i) => `${i + 1}. ${p}`),
    '</form_prompts>',
    input.variation ? `\n<vary>${input.variation}</vary>` : '',
    '',
    'For entities_used, list the elements of the shift you depicted. Leave unsupported_claims empty.'
  ].join('\n');
}
