import 'server-only';

import { getProvider } from '@/lib/ai/provider';
import { parsePronouns, type ParsedResident, type ParseResult } from './import';

/**
 * Read a roster the deterministic parser could not.
 *
 * The CSV parser handles anything shaped like a spreadsheet. It cannot handle
 * what people actually paste: a Word table, a block out of an email, a numbered
 * list, "Room 2B - Alex Rivera (he/him) DOB 4/12/85". That is where this comes
 * in — and only there. The parser runs first every time, because it is instant,
 * free, and produces the same answer twice.
 *
 * NOTE ON PHI: a roster is names and dates of birth, and possibly Medicaid IDs.
 * De-identifying is not an option here — the names are the payload. So this
 * sends protected information to the model vendor and needs a signed BAA with
 * them, exactly like the note assistant. The UI says so before it runs.
 */

const SYSTEM = `You extract resident roster entries from messy text for a group home.

Return one entry per person. Never invent a person, a date, or an ID. If a field
is not present in the text, leave it null — a blank is correct and a guess is
not.

Rules:
- first_name and last_name are required. If a line has only one name, put it in
  first_name and leave last_name null; the reviewer will fix it.
- preferred_name only when the text actually shows one, e.g. "Alexander (Alex)"
  or "goes by Alex".
- dob must be ISO (YYYY-MM-DD). Convert 4/12/1985 to 1985-04-12. A two-digit
  year is ambiguous: prefer 19xx for anyone who looks like an adult resident.
  If you cannot tell, return null.
- pronouns: one of "he", "she", "they", or null. Only from an explicit marker
  like (he/him). Never infer pronouns from a name.
- medicaid_id: digits only, as written. Null if absent.
- room and grouping (hall, wing, program) only if stated.

Output every person you find, in the order they appear.`;

const SCHEMA = {
  type: 'object',
  properties: {
    residents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          first_name: { type: 'string' },
          last_name: { type: ['string', 'null'] },
          preferred_name: { type: ['string', 'null'] },
          room: { type: ['string', 'null'] },
          grouping: { type: ['string', 'null'] },
          dob: { type: ['string', 'null'] },
          pronouns: { type: ['string', 'null'] },
          medicaid_id: { type: ['string', 'null'] }
        },
        required: [
          'first_name',
          'last_name',
          'preferred_name',
          'room',
          'grouping',
          'dob',
          'pronouns',
          'medicaid_id'
        ],
        additionalProperties: false
      }
    }
  },
  required: ['residents'],
  additionalProperties: false
} as const;

/** Cap the paste so one person cannot spend the agency's budget in a click. */
const MAX_CHARS = 20_000;

export type AiParseResult = ParseResult & {
  usedAi: true;
  /** Rough cost of this call, for the receipt shown in the UI. */
  costCents: number | null;
};

export async function aiParseRoster(text: string): Promise<AiParseResult | { error: string }> {
  const trimmed = text.trim().slice(0, MAX_CHARS);
  if (!trimmed) return { error: 'Nothing to read.' };

  const provider = await getProvider();
  const health = await provider.health();
  if (!health.ok) {
    return { error: 'The assistant is not set up, so the list has to be a spreadsheet for now.' };
  }

  if (!provider.generateStructured) {
    return {
      error: 'The current assistant cannot read free-form lists. Use a spreadsheet or CSV file.'
    };
  }

  const result = await provider.generateStructured<{ residents?: Array<Record<string, unknown>> }>(
    SYSTEM,
    `Extract every resident from this text.\n\n<text>\n${trimmed}\n</text>`,
    SCHEMA as unknown as Record<string, unknown>,
    'resident_roster'
  );

  if (!result.ok) {
    return { error: 'Could not read that list. Try tidying it, or use a CSV file.' };
  }

  const rows = Array.isArray(result.data.residents) ? result.data.residents : [];
  const residents: ParsedResident[] = [];
  const errors: ParseResult['errors'] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const first = String(row.first_name ?? '').trim();
    const last = String(row.last_name ?? '').trim();

    if (!first) {
      errors.push({ rowNumber, message: 'No name could be read on this line.' });
      return;
    }

    const warnings: string[] = [];
    if (!last) warnings.push('No last name found — add it before importing.');

    const { pronouns, warning } = parsePronouns(
      typeof row.pronouns === 'string' ? row.pronouns : undefined
    );
    // The model was told not to guess, so an absent pronoun is expected rather
    // than a defect; only surface the note when it returned something unusable.
    if (warning && row.pronouns) warnings.push(warning);
    if (!row.pronouns) warnings.push('No pronouns stated — defaulted to they/them. Set them below.');

    const dob = typeof row.dob === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.dob) ? row.dob : null;
    if (row.dob && !dob) warnings.push(`Could not read the date of birth "${row.dob}".`);

    residents.push({
      rowNumber,
      firstName: first,
      lastName: last,
      preferredName: (row.preferred_name as string | null)?.trim() || null,
      room: (row.room as string | null)?.trim() || null,
      grouping: (row.grouping as string | null)?.trim() || null,
      dob,
      pronouns,
      medicaidId: (row.medicaid_id as string | null)?.trim() || null,
      warnings
    });
  });

  // gpt-4o-mini list pricing, for the receipt. Approximate by design — it is
  // there to show the order of magnitude, not to bill anyone.
  const inTok = result.usage.inputTokens ?? 0;
  const outTok = result.usage.outputTokens ?? 0;
  const costCents =
    inTok || outTok ? ((inTok / 1_000_000) * 0.15 + (outTok / 1_000_000) * 0.6) * 100 : null;

  return { residents, errors, unknownColumns: [], usedAi: true, costCents };
}
