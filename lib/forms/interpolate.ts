import type { FormField, FormTemplateSchema, Pronouns, StructuredData } from '@/lib/types';

/**
 * Template placeholders.
 *
 * The paper form writes the resident's name into each prompt ("Where did Jay
 * choose to go?"). Labels in the template schema use {name} and pronoun tokens
 * so one template serves every resident, with correct pronouns rather than
 * pronouns guessed from a first name.
 */
export function interpolate(
  text: string,
  ctx: { name: string; pronouns: Pronouns }
): string {
  return text
    .replace(/\{name\}/g, ctx.name)
    .replace(/\{subject\}/g, ctx.pronouns.subject)
    .replace(/\{object\}/g, ctx.pronouns.object)
    .replace(/\{possessive\}/g, ctx.pronouns.possessive);
}

/** Namespaced key for a field's value inside `structured_data`. */
export function fieldKey(sectionKey: string, field: FormField): string {
  return `${sectionKey}.${field.key}`;
}

export function getFieldValue(
  data: StructuredData,
  sectionKey: string,
  field: FormField
): string[] | boolean | string | undefined {
  return data[fieldKey(sectionKey, field)];
}

/** Evaluate a `visible_when` / `required_when` rule against current answers. */
export function ruleMatches(
  rule: { field: string; equals: unknown } | undefined,
  data: StructuredData,
  sectionKey: string
): boolean {
  if (!rule) return true;
  const value = data[`${sectionKey}.${rule.field}`];
  return value === rule.equals;
}

export function isFieldVisible(
  field: FormField,
  data: StructuredData,
  sectionKey: string
): boolean {
  return ruleMatches(field.visible_when, data, sectionKey);
}

export function isFieldRequired(
  field: FormField,
  data: StructuredData,
  sectionKey: string
): boolean {
  return field.required_when ? ruleMatches(field.required_when, data, sectionKey) : false;
}

/**
 * True when anything the DSP selected marks this shift as having a concern.
 *
 * Drives whether the narrative may end with "There were no problems or
 * concerns during shift." Getting this wrong in either direction is a
 * documentation error, so it is computed from the data rather than left to
 * the model's judgement.
 */
export function shiftHasConcern(schema: FormTemplateSchema, data: StructuredData): boolean {
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const value = getFieldValue(data, section.key, field);

      if (field.type === 'boolean') {
        if (field.flags_concern_when_true && value === true) return true;
      }

      if (field.type === 'chips' && Array.isArray(value)) {
        const concerning = new Set(
          field.options.filter((o) => o.flags_concern).map((o) => o.value)
        );
        if (value.some((v) => concerning.has(v))) return true;
      }
    }
  }
  return false;
}

/** True when the DSP has entered enough to be worth drafting from. */
export function hasAnySelection(schema: FormTemplateSchema, data: StructuredData): boolean {
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const value = getFieldValue(data, section.key, field);
      if (Array.isArray(value) && value.length > 0) return true;
      if (typeof value === 'boolean' && value) return true;
      if (typeof value === 'string' && value.trim() !== '') return true;
    }
  }
  return false;
}

/**
 * Flatten answers into readable label text, which is what the model sees.
 * Sending labels rather than raw enum values keeps the prompt legible and
 * makes the grounding check in lib/ai/guard.ts meaningful.
 */
export function describeSelections(
  schema: FormTemplateSchema,
  data: StructuredData,
  ctx: { name: string; pronouns: Pronouns }
): Array<{ section: string; field: string; promptRef?: number; values: string[] }> {
  const out: Array<{ section: string; field: string; promptRef?: number; values: string[] }> = [];

  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (!isFieldVisible(field, data, section.key)) continue;
      const value = getFieldValue(data, section.key, field);
      let values: string[] = [];

      if (field.type === 'chips' && Array.isArray(value)) {
        const byValue = new Map(field.options.map((o) => [o.value, o.label]));
        values = value.map((v) => interpolate(byValue.get(v) ?? v, ctx));
      } else if (field.type === 'boolean' && typeof value === 'boolean') {
        if (!value) continue;
        values = ['yes'];
      } else if (field.type === 'text' && typeof value === 'string' && value.trim()) {
        values = [value.trim()];
      }

      if (values.length === 0) continue;

      out.push({
        section: section.title,
        field: interpolate(field.label, ctx),
        promptRef: field.prompt_ref,
        values
      });
    }
  }

  return out;
}
