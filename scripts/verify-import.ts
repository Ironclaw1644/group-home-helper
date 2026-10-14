/**
 * Offline checks for the roster importer.
 *
 *   npm run verify:import
 *
 * These are the cases a real agency spreadsheet actually hits. Getting any of
 * them wrong means residents imported under the wrong name or with the wrong
 * date of birth, and notes then filed against that record — so this runs
 * without a database or a network and should stay that way.
 *
 * The starter-outcome pronoun checks used to live here. They moved to
 * verify:jurisdictions when the outcome library moved out of TypeScript and
 * into the template rows — which is where the libraries now are, and which
 * covers every jurisdiction rather than only Virginia.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectDelimiter, parseCsv, parseRoster } from '../lib/residents/import';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\nSpreadsheet quirks');

// Excel writes a UTF-8 BOM and CRLF line endings.
const excel = '﻿First Name,Last Name,Room\r\nAlexander,Rivera,2B\r\n';
let result = parseRoster(excel);
check(
  'a BOM does not swallow the first column',
  result.residents.length === 1 && result.residents[0].firstName === 'Alexander',
  JSON.stringify(result.residents)
);
check('CRLF rows parse', result.residents[0]?.room === '2B');

result = parseRoster('First Name,Last Name,Group\nJo,"Smith, Jr.",North\n');
check(
  'a comma inside quotes stays in one field',
  result.residents[0]?.lastName === 'Smith, Jr.',
  JSON.stringify(result.residents[0])
);

const escaped = parseCsv('a,"say ""hi""",c\n');
check('escaped quotes decode', escaped[0][1] === 'say "hi"', JSON.stringify(escaped[0]));

result = parseRoster('First,Last\n\nA,B\n\n');
check('blank lines are ignored', result.residents.length === 1);

console.log('\nHeader matching');

result = parseRoster('FIRST_NAME , last name ,Nickname,Pronouns\nAlexander,Rivera,Alex,she/her\n');
check(
  'aliases and stray case/underscores match',
  result.residents[0]?.preferredName === 'Alex',
  JSON.stringify(result.residents[0])
);
check('pronouns read from a she/her cell', result.residents[0]?.pronouns.subject === 'she');

result = parseRoster('First,Last,Favorite Color\nA,B,blue\n');
check(
  'unrecognized columns are reported, not silently dropped',
  result.unknownColumns.includes('Favorite Color'),
  JSON.stringify(result.unknownColumns)
);

result = parseRoster('Name,Room\nSam Lee,2B\n');
check(
  'a file with no first/last columns fails loudly',
  result.errors.length > 0 && result.residents.length === 0
);

console.log('\nValues that need a human to look');

result = parseRoster('First,Last,Pronouns\nSam,Lee,xyz\n');
check('unreadable pronouns fall back to they/them', result.residents[0]?.pronouns.subject === 'they');
check(
  'and say so rather than silently defaulting',
  result.residents[0]?.warnings.some((w) => w.toLowerCase().includes('pronouns'))
);

result = parseRoster('First,Last,DOB\nA,B,04/12/1985\n');
check('US-format dates convert', result.residents[0]?.dob === '1985-04-12', String(result.residents[0]?.dob));

result = parseRoster('First,Last,DOB\nA,B,1985-04-12\n');
check('ISO dates pass through', result.residents[0]?.dob === '1985-04-12');

result = parseRoster('First,Last,DOB\nA,B,not a date\n');
check(
  'an unreadable date blanks the field and warns',
  result.residents[0]?.dob === null && result.residents[0].warnings.length > 0
);

result = parseRoster('First,Last,DOB\nA,B,13/45/1985\n');
check('an impossible date is rejected', result.residents[0]?.dob === null);

console.log('\nDuplicates and partial failures');

result = parseRoster('First,Last\nSam,Lee\nSam,Lee\n');
check(
  'a repeated name inside one file is flagged',
  result.residents[1]?.warnings.some((w) => w.includes('Same name')),
  JSON.stringify(result.residents[1]?.warnings)
);
check('but both rows are still offered', result.residents.length === 2);

result = parseRoster('First,Last\nSam,\nJo,Ray\n');
check(
  'a row missing a name errors without taking the good rows with it',
  result.errors.length === 1 && result.residents.length === 1,
  `errors=${result.errors.length} residents=${result.residents.length}`
);

console.log('\nCells pasted from a spreadsheet');

// Copying cells out of Excel or Google Sheets puts tab-separated text on the
// clipboard, not CSV. Until 10-14 every such paste was read as one column and
// came back "not laid out like a spreadsheet".
const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures/roster', name), 'utf8');

const excelPaste = fixture('excel-paste.tsv');
check('an Excel paste is read as tab-separated', detectDelimiter(excelPaste) === '\t');
result = parseRoster(excelPaste);
check(
  'an Excel paste: every person, CRLF and trailing blank lines ignored',
  result.residents.length === 4 && result.errors.length === 0,
  `residents=${result.residents.length} errors=${JSON.stringify(result.errors)}`
);
check(
  'an Excel paste: a comma inside a cell stays in that cell',
  result.residents[1]?.lastName === 'Ferreira, Jr.' && result.residents[1]?.preferredName === 'Lu',
  JSON.stringify(result.residents[1])
);
check(
  'an Excel paste: a quoted cell keeps its doubled quotes and its line break',
  result.residents[2]?.preferredName === 'Sammy "S"' && result.residents[2]?.grouping === 'South\nAnnex',
  JSON.stringify(result.residents[2])
);
check(
  'an Excel paste: dates, pronouns and Medicaid IDs land in their columns',
  result.residents[0]?.dob === '1979-03-14' &&
    result.residents[0]?.pronouns.subject === 'she' &&
    result.residents[0]?.medicaidId === '100000000021' &&
    result.residents[3]?.dob === '1965-01-30' &&
    result.residents[3]?.medicaidId === null,
  JSON.stringify([result.residents[0], result.residents[3]])
);

const sheetsPaste = fixture('google-sheets-paste.tsv');
result = parseRoster(sheetsPaste);
check(
  'a Google Sheets paste: every person, the all-tabs row and trailing empty columns ignored',
  result.residents.length === 4 && result.errors.length === 0,
  `residents=${result.residents.length} errors=${JSON.stringify(result.errors)}`
);
check(
  'a Google Sheets paste: the last row, with no newline after it, is read',
  result.residents[3]?.firstName === 'Grace' && result.residents[3]?.room === '5B',
  JSON.stringify(result.residents[3])
);
check(
  'a Google Sheets paste: quotes in the middle of a cell do not swallow the row',
  result.residents[0]?.room === '2A' && result.residents[1]?.firstName === 'Luis',
  JSON.stringify(result.residents.slice(0, 2))
);
check(
  'a Google Sheets paste: unknown columns are reported, blank headers are not',
  JSON.stringify(result.unknownColumns) === '["Notes"]',
  JSON.stringify(result.unknownColumns)
);

result = parseRoster('First\tLast\tRoom\r\nAna\tDiaz\t1\rBo\tLee\t2\r');
check(
  'old Excel for Mac line endings (a lone CR) end a row',
  result.residents.length === 2 && result.residents[1]?.room === '2',
  JSON.stringify(result.residents)
);

result = parseRoster('Last Name;First Name;Room\nRivera;Alexander;2B\n');
check(
  'a semicolon export is read by its separator',
  result.residents[0]?.firstName === 'Alexander' && result.residents[0]?.room === '2B',
  JSON.stringify(result.residents)
);
check(
  'a comma file stays comma with a semicolon inside a quoted header',
  detectDelimiter('"Room; bed; wing",First,Last\n1,A,B\n') === ','
);
check(
  'a comma file keeps its old quote rule',
  parseCsv('a,b"c,d"e\n')[0].length === 2,
  JSON.stringify(parseCsv('a,b"c,d"e\n'))
);

// The ragged paste the assistant exists for must still fall through to it.
result = parseRoster('Alexander Rivera (Alex), room 2B, he/him, DOB 4/12/85\nMaria Ochoa — 3A — she/her\n');
check('a ragged list is still not taken for a spreadsheet', result.residents.length === 0);

console.log(`\n${'='.repeat(50)}`);
console.log(`${passed} passed, ${failed} failed`);
console.log(failed === 0 ? 'Import checks passed.\n' : 'Import checks FAILED.\n');
process.exit(failed === 0 ? 0 : 1);
