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
import { parseCsv, parseRoster } from '../lib/residents/import';

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

console.log(`\n${'='.repeat(50)}`);
console.log(`${passed} passed, ${failed} failed`);
console.log(failed === 0 ? 'Import checks passed.\n' : 'Import checks FAILED.\n');
process.exit(failed === 0 ? 0 : 1);
