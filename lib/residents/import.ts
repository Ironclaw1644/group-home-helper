/**
 * Parse a pasted or uploaded resident roster.
 *
 * Agencies keep their roster in a spreadsheet, so import has to survive what a
 * spreadsheet export actually looks like: a UTF-8 BOM from Excel, CRLF endings,
 * quoted fields containing commas, and header names nobody agreed on.
 *
 * Parsing is deliberately separate from writing. The UI parses, shows the
 * supervisor exactly what it understood, and only then writes — importing a
 * roster wrong and discovering it later means notes filed against the wrong
 * person, which is not a fixable mistake once they are signed.
 */

export type ParsedResident = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  room: string | null;
  grouping: string | null;
  dob: string | null;
  pronouns: { subject: string; object: string; possessive: string };
  medicaidId: string | null;
  /** Non-fatal problems: the row imports, but the supervisor should look. */
  warnings: string[];
};

export type ParseError = { rowNumber: number; message: string };

export type ParseResult = {
  residents: ParsedResident[];
  errors: ParseError[];
  /** Header names present in the file that we did not recognize. */
  unknownColumns: string[];
};

/** RFC4180-ish: handles quoted fields, escaped quotes, and embedded newlines. */
export function parseCsv(text: string): string[][] {
  // Excel writes a BOM. Left in place it becomes part of the first header name,
  // so "first_name" stops matching and every row loses its first column.
  const input = text.replace(/^﻿/, '');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      // Swallow; the \n that follows ends the row.
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  // Whatever is buffered when input ends is a final row, unless the file ends
  // with a newline and both buffers are empty.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

/** Header aliases, so a supervisor does not have to rename their columns. */
const COLUMN_ALIASES: Record<string, string[]> = {
  firstName: ['first name', 'first', 'firstname', 'given name', 'fname'],
  lastName: ['last name', 'last', 'lastname', 'surname', 'family name', 'lname'],
  preferredName: ['preferred name', 'preferred', 'nickname', 'goes by', 'known as'],
  room: ['room', 'room number', 'room #', 'unit', 'bed'],
  grouping: ['group', 'grouping', 'hall', 'wing', 'program', 'category'],
  dob: ['dob', 'date of birth', 'birthdate', 'birth date'],
  pronouns: ['pronouns', 'pronoun'],
  medicaidId: ['medicaid', 'medicaid id', 'medicaid #', 'medicaid number', 'recipient id']
};

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ');
}

function mapHeaders(headerRow: string[]): {
  map: Record<string, number>;
  unknown: string[];
} {
  const map: Record<string, number> = {};
  const unknown: string[] = [];

  headerRow.forEach((raw, index) => {
    const norm = normalizeHeader(raw);
    if (!norm) return;

    const field = Object.entries(COLUMN_ALIASES).find(([, aliases]) =>
      aliases.includes(norm)
    )?.[0];

    if (field) {
      // First occurrence wins; a duplicated column would otherwise silently
      // shadow the one the supervisor filled in.
      if (!(field in map)) map[field] = index;
    } else {
      unknown.push(raw.trim());
    }
  });

  return { map, unknown };
}

/**
 * Pronoun sets.
 *
 * Only these three are offered. Free-text pronouns would flow straight into a
 * generated narrative, and a malformed set produces sentences that read as
 * careless about the resident.
 */
const PRONOUN_SETS: Record<string, { subject: string; object: string; possessive: string }> = {
  he: { subject: 'he', object: 'him', possessive: 'his' },
  she: { subject: 'she', object: 'her', possessive: 'her' },
  they: { subject: 'they', object: 'them', possessive: 'their' }
};

export function parsePronouns(raw: string | undefined): {
  pronouns: { subject: string; object: string; possessive: string };
  warning: string | null;
} {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) {
    return { pronouns: PRONOUN_SETS.they, warning: null };
  }

  const first = value.split(/[\s/,]+/)[0];
  if (first in PRONOUN_SETS) {
    return { pronouns: PRONOUN_SETS[first], warning: null };
  }

  return {
    pronouns: PRONOUN_SETS.they,
    warning: `Could not read pronouns "${raw}" — defaulted to they/them. Set it on the resident.`
  };
}

/** Accepts ISO and US formats; returns ISO or null. */
function parseDob(raw: string | undefined): { dob: string | null; warning: string | null } {
  const value = (raw ?? '').trim();
  if (!value) return { dob: null, warning: null };

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return { dob: value, warning: null };

  const us = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    let [, m, d, y] = us;
    if (y.length === 2) {
      // A resident born in '25 was born in 1925, not 2025. Two-digit years are
      // ambiguous, so flag rather than guess silently.
      y = `19${y}`;
    }
    const month = m.padStart(2, '0');
    const day = d.padStart(2, '0');
    const candidate = `${y}-${month}-${day}`;
    if (Number(month) > 12 || Number(day) > 31) {
      return { dob: null, warning: `Could not read date of birth "${value}" — left blank.` };
    }
    return {
      dob: candidate,
      warning: us[3].length === 2 ? `Read "${value}" as ${candidate}. Check the year.` : null
    };
  }

  return { dob: null, warning: `Could not read date of birth "${value}" — left blank.` };
}

export function parseRoster(text: string): ParseResult {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { residents: [], errors: [{ rowNumber: 0, message: 'The file is empty.' }], unknownColumns: [] };
  }

  const { map, unknown } = mapHeaders(rows[0]);

  if (map.firstName === undefined || map.lastName === undefined) {
    return {
      residents: [],
      errors: [
        {
          rowNumber: 1,
          message:
            'Could not find a first name and last name column. Expected headers like "First Name, Last Name, Room".'
        }
      ],
      unknownColumns: unknown
    };
  }

  const residents: ParsedResident[] = [];
  const errors: ParseError[] = [];
  const seen = new Map<string, number>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1; // 1-based, counting the header
    const cell = (index: number | undefined) =>
      index === undefined ? undefined : row[index]?.trim();

    const firstName = cell(map.firstName) ?? '';
    const lastName = cell(map.lastName) ?? '';

    if (!firstName || !lastName) {
      errors.push({ rowNumber, message: 'Missing a first or last name.' });
      continue;
    }

    const warnings: string[] = [];

    // Duplicate names inside the same file are almost always a copy-paste
    // mistake, and importing both makes two chart entries for one person.
    const key = `${firstName.toLowerCase()}|${lastName.toLowerCase()}`;
    const firstSeenAt = seen.get(key);
    if (firstSeenAt) {
      warnings.push(`Same name as row ${firstSeenAt}. Import only if these are two different people.`);
    } else {
      seen.set(key, rowNumber);
    }

    const { pronouns, warning: pronounWarning } = parsePronouns(cell(map.pronouns));
    if (pronounWarning) warnings.push(pronounWarning);

    const { dob, warning: dobWarning } = parseDob(cell(map.dob));
    if (dobWarning) warnings.push(dobWarning);

    const medicaidId = cell(map.medicaidId) || null;
    if (medicaidId && !/^\d{6,}$/.test(medicaidId.replace(/[\s-]/g, ''))) {
      warnings.push(`"${medicaidId}" does not look like a Medicaid ID. It will be stored as written.`);
    }

    residents.push({
      rowNumber,
      firstName,
      lastName,
      preferredName: cell(map.preferredName) || null,
      room: cell(map.room) || null,
      grouping: cell(map.grouping) || null,
      dob,
      pronouns,
      medicaidId,
      warnings
    });
  }

  return { residents, errors, unknownColumns: unknown };
}

/** The header line offered as a download, so a supervisor can start from it. */
export const TEMPLATE_CSV =
  'First Name,Last Name,Preferred Name,Room,Group,Date of Birth,Pronouns,Medicaid ID\n' +
  'Alexander,Rivera,Alex,2B,North Hall,1985-04-12,he,100000000000\n';
