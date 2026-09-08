import 'server-only';

import { cache } from 'react';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_IDENTITY_LABELS } from '@/lib/forms/layout-defaults';

/**
 * The jurisdictions an agency may choose.
 *
 * Read from the installed templates, never from a list in this file. That is
 * the whole point: adding a state is authoring a template row, and if the
 * choices a customer sees came from a constant here, adding a state would also
 * mean a code change and a deploy.
 *
 * See docs/adding-a-state.md.
 */

export type JurisdictionOption = {
  /** 'US-VA', 'US-OH', or 'GENERIC'. */
  code: string;
  /** 'Virginia', 'Ohio', 'Another state — general-purpose note'. */
  name: string;
  /** The heading this state's form prints — 'Daily Progress Note'. */
  formTitle: string;
  /** Its footer line — 'Daily Progress Notes Form #680'. */
  formLine: string;
  /** Its identity blanks — ["Individual's Name:", 'Medicaid:']. */
  identityLabels: string[];
};

/**
 * Sorted for a picker: real states alphabetically, the general-purpose
 * fallback last. It is last because it is the answer for someone whose state
 * is not on the list, and reading past their own state to find it would be an
 * odd way round.
 */
function forDisplay(rows: JurisdictionOption[]): JurisdictionOption[] {
  return [...rows].sort((a, b) => {
    if (a.code === 'GENERIC') return 1;
    if (b.code === 'GENERIC') return -1;
    return a.name.localeCompare(b.name);
  });
}

type JurisdictionRow = {
  code: string;
  name: string;
  form_title: string | null;
  form_line: string | null;
  identity_labels: string[] | null;
};

/**
 * The states an agency can sign up under.
 *
 * Read with the admin client, not the request's own. The sign-up page is
 * server-rendered for someone who by definition has no session, so the request
 * client acts as `anon` — and `anon` has no USAGE on the ghh schema, so the
 * call failed and this function returned an empty list. The picker rendered
 * with no options, the form could not be completed, and no stranger could
 * create an agency at all.
 *
 * The tempting fix is to grant anon access to the schema. That is worse than
 * it looks: every function in ghh carries the default EXECUTE-to-PUBLIC, and
 * sixteen of them have no explicit `authenticated` grant because policies rely
 * on the PUBLIC one — so the schema cannot be opened to anon without either
 * publishing all of them or risking RLS breaking for signed-in users.
 *
 * Reading it here instead keeps anonymous visitors out of the database
 * entirely. What is returned is jurisdiction codes, display names and form
 * captions: template metadata with no organization, resident or note data in
 * it, which is why it is safe to render before an account exists.
 */
export const listJurisdictions = cache(async (): Promise<JurisdictionOption[]> => {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc('available_jurisdictions');

  if (error) {
    // Never fail silently again. An empty list here is indistinguishable from
    // "this product supports no states", and it took a QA pass to notice.
    console.error('[jurisdictions] could not list jurisdictions:', error.message);
    return [];
  }
  if (!data) return [];
  return forDisplay(
    (data as JurisdictionRow[]).map((r) => ({
      code: r.code,
      name: r.name,
      formTitle: r.form_title ?? 'Daily Progress Note',
      formLine: r.form_line ?? '',
      // A template that declares no identity rows prints Form #680's, so fall
      // back to the constants the renderer itself falls back to rather than
      // to a second copy of them.
      identityLabels: (r.identity_labels ?? DEFAULT_IDENTITY_LABELS).map((l) => l.trim())
    }))
  );
});

/**
 * Whether an agency may be moved to this jurisdiction.
 *
 * Checked against the templates actually installed rather than against a list
 * of codes, so an agency can never be put in a state that has no form to
 * print — and so no route has to be edited when a state is added.
 */
export async function isSelectableJurisdiction(code: string): Promise<boolean> {
  return (await listJurisdictions()).some((j) => j.code === code);
}

/** The chosen option, or the closest thing to it, for showing a preview. */
export function jurisdictionOption(
  options: JurisdictionOption[],
  code: string | null | undefined
): JurisdictionOption | null {
  if (!code) return null;
  return options.find((j) => j.code === code) ?? null;
}

/**
 * What each state gets, for the public "your state" page.
 *
 * Separate from listJurisdictions because it answers a different question. That
 * one feeds a picker and needs a code and a label. This one is for a stranger
 * deciding whether we understand their state, so it carries the thing they
 * would actually check: whether the printed page cites their documentation rule
 * and, if so, which one.
 *
 * Reads the templates directly with the admin client for the same reason
 * listJurisdictions does — anonymous visitors stay out of the database, and
 * what comes back is template metadata with no organization, resident or note
 * data in it.
 */
export type JurisdictionDetail = {
  code: string;
  name: string;
  formTitle: string;
  formLine: string;
  /** The rule cited at the foot of the page, or null when none is claimed. */
  citation: string | null;
};

export const listJurisdictionDetails = cache(async (): Promise<JurisdictionDetail[]> => {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('form_templates')
    .select('jurisdiction, jurisdiction_name, render_config')
    .is('org_id', null)
    .eq('active', true);

  if (error || !data) {
    console.error('[jurisdictions] could not list details:', error?.message);
    return [];
  }

  const rows = data
    .filter((r) => r.jurisdiction !== 'GENERIC')
    .map((r) => {
      const cfg = (r.render_config ?? {}) as {
        header?: { title?: string };
        footer?: { form_line?: string; legal_citation?: string };
      };
      return {
        code: r.jurisdiction as string,
        name: (r.jurisdiction_name as string | null) ?? (r.jurisdiction as string),
        formTitle: cfg.header?.title ?? 'Daily Progress Note',
        formLine: cfg.footer?.form_line ?? 'Daily Progress Note',
        citation: cfg.footer?.legal_citation ?? null
      };
    });

  return rows.sort((a, b) => a.name.localeCompare(b.name));
});
