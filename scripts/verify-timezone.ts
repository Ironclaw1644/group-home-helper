/**
 * Prove that a service date is the agency's calendar day, not the server's.
 *
 *   npm run verify:timezone
 *
 * The failure this guards is silent and expensive. `orgTimeZone()` used to
 * return `process.env.NEXT_PUBLIC_ORG_TIMEZONE || 'America/New_York'` with no
 * arguments and no org lookup, while sign-up collected the browser's timezone
 * and wrote it to `organizations.timezone` where nothing ever read it. For a
 * Pacific customer the day rolled over at 21:00 local, so a 7PM–7AM shift
 * written at 22:00 was filed under tomorrow. Nothing warns anybody; it surfaces
 * as an audit finding on a Medicaid billing record months later.
 */
import { addDays, isValidTimeZone, todayInTimeZone } from '../lib/utils';
import { safeNextPath } from '../lib/auth/redirect';

let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${label}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function eq(label: string, actual: string, expected: string) {
  check(label, actual === expected, `got ${actual}, expected ${expected}`);
}

/** 1 June 2026, 22:00 Pacific Daylight Time — i.e. 2 June 05:00 UTC. */
const NIGHT_SHIFT_PT = new Date('2026-06-02T05:00:00Z');

console.log('\nThe day boundary belongs to the agency\n');

eq(
  'a 22:00 Pacific note is dated 1 June in Los Angeles',
  todayInTimeZone('America/Los_Angeles', NIGHT_SHIFT_PT),
  '2026-06-01'
);

eq(
  'the same instant is already 2 June in UTC',
  todayInTimeZone('UTC', NIGHT_SHIFT_PT),
  '2026-06-02'
);

eq(
  'and 2 June in New York — the old hardcoded default',
  todayInTimeZone('America/New_York', NIGHT_SHIFT_PT),
  '2026-06-02'
);

check(
  'so a Pacific agency and the old default disagree about the service date',
  todayInTimeZone('America/Los_Angeles', NIGHT_SHIFT_PT) !==
    todayInTimeZone('America/New_York', NIGHT_SHIFT_PT)
);

// Midday is unambiguous everywhere in the continental US; if this drifts, the
// formatter itself is wrong rather than the boundary handling.
const MIDDAY = new Date('2026-06-01T18:00:00Z');
eq('midday agrees across US zones (Los Angeles)', todayInTimeZone('America/Los_Angeles', MIDDAY), '2026-06-01');
eq('midday agrees across US zones (New York)', todayInTimeZone('America/New_York', MIDDAY), '2026-06-01');

console.log('\nDate arithmetic stays in calendar space\n');

eq('90 days back from 1 June 2026', addDays('2026-06-01', -90), '2026-03-03');
eq('a day forward across a month end', addDays('2026-06-30', 1), '2026-07-01');
eq('a day back across a year end', addDays('2026-01-01', -1), '2025-12-31');
eq('a leap day is real in 2028', addDays('2028-02-28', 1), '2028-02-29');
eq(
  'crossing a DST spring-forward does not lose a day',
  addDays('2026-03-07', 3),
  '2026-03-10'
);

console.log('\nAn unusable timezone falls back instead of throwing\n');

check('a real IANA name is accepted', isValidTimeZone('America/Los_Angeles'));
check('UTC is accepted', isValidTimeZone('UTC'));
check('a made-up name is rejected', !isValidTimeZone('Mars/Olympus_Mons'));
check('an empty string is rejected', !isValidTimeZone(''));
check('whitespace is rejected', !isValidTimeZone('   '));
check('null is rejected', !isValidTimeZone(null));
check('a number is rejected', !isValidTimeZone(42));

// The reason the guard exists: the column is written from whatever the
// browser reported, so an unknown name must not reach Intl unchecked.
let threw = false;
try {
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Mars/Olympus_Mons' });
} catch {
  threw = true;
}
check('Intl really does throw on an unknown zone, which is what we are guarding', threw);

console.log('\nA reset link cannot bounce someone off-origin\n');

// `next` rides on a URL that was in an email inbox. An absolute value here
// would let a crafted reset link drop a care worker on a copy of the sign-in
// page at the moment they least expect it.
eq('an ordinary path is kept', safeNextPath('/reset'), '/reset');
eq('a nested path is kept', safeNextPath('/residents/import'), '/residents/import');
eq('an absolute URL is refused', safeNextPath('https://evil.example'), '/reset');
eq('a protocol-relative host is refused', safeNextPath('//evil.example'), '/reset');
eq('a backslash host is refused', safeNextPath('/\\evil.example'), '/reset');
eq('a javascript: URL is refused', safeNextPath('javascript:alert(1)'), '/reset');
eq('null falls back', safeNextPath(null), '/reset');
eq('undefined falls back', safeNextPath(undefined), '/reset');

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log('All timezone and auth-redirect checks passed.\n');
