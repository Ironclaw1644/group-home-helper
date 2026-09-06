import type { FormTemplate, LibraryOutcome, Pronouns } from '@/lib/types';

/**
 * Starter service-plan outcomes, read from the jurisdiction's own template.
 *
 * This used to be `lib/outcomes/virginia-library.ts` — a const array imported
 * by a server route, by demo provisioning, by a verification script, and by a
 * *client* component, which meant every customer downloaded Virginia's
 * vocabulary in their browser bundle whatever state they were in. Adding a
 * state's starter plans meant editing a module and redeploying.
 *
 * Now the library is `schema.outcome_library` on the template row, so a
 * jurisdiction's whole form — prompts, sections, printed layout, signature
 * block and starter plans — is one INSERT. See docs/adding-a-state.md.
 *
 * These are a DRAFTING AID, not a plan. They land as ordinary editable rows so
 * a supervisor rewrites them in the person's own words; a template outcome is
 * by definition not person-centered, which is the whole point of a
 * person-centred plan.
 */

/** The starter outcomes this template offers, or none. */
export function libraryFor(template: Pick<FormTemplate, 'schema'>): LibraryOutcome[] {
  return template.schema.outcome_library ?? [];
}

/**
 * Find one starter outcome by key.
 *
 * Returns undefined rather than falling back to another jurisdiction's outcome
 * of the same name — a Virginia plan appearing in an Ohio chart because the
 * keys happened to collide is the multi-tenant version of the bug this branch
 * exists to remove.
 */
export function libraryOutcome(
  template: Pick<FormTemplate, 'schema'>,
  key: string
): LibraryOutcome | undefined {
  return libraryFor(template).find((o) => o.key === key);
}

/** Fill the placeholders with this resident's name and pronouns. */
export function personalize(text: string, name: string, pronouns: Pronouns): string {
  return text
    .replace(/\{name\}/g, name)
    .replace(/\{subject\}/g, pronouns.subject)
    .replace(/\{object\}/g, pronouns.object)
    .replace(/\{possessive\}/g, pronouns.possessive);
}
