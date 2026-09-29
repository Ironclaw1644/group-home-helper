/**
 * Prove that saving an outcome as an agency preset takes the person out of it.
 *
 *   npm run verify:presets
 *
 * A resident's outcome is written about that resident, by name. A preset is an
 * org-wide row readable by every colleague, including staff with no access to
 * that person's home. So the substitution in lib/outcomes/depersonalize.ts is
 * the thing standing between a chart and a PHI leak across that boundary, and
 * a regex that silently stops matching is exactly the kind of failure nobody
 * notices — the preset still saves, it just saves a name.
 *
 * The round trip matters as much as the substitution: a placeholder that
 * `personalize()` does not expand would print "{possessive}" on somebody's
 * plan, so both halves are asserted against each other here.
 */
import {
  depersonalize,
  draftPresetFrom,
  draftTexts,
  findNames,
  type NameIdentity
} from '../lib/outcomes/depersonalize';
import { personalize } from '../lib/outcomes/library';
import type { Outcome, OutcomeActivity } from '../lib/types';

let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${label}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function eq(label: string, actual: string, expected: string) {
  check(label, actual === expected, `got ${JSON.stringify(actual)}`);
}

const ALEX: NameIdentity = {
  firstName: 'Alex',
  lastName: 'Rivera',
  preferredName: null,
  pronouns: { subject: 'he', object: 'him', possessive: 'his' }
};

const MARIA: NameIdentity = {
  firstName: 'Maria',
  lastName: 'Santos',
  preferredName: 'Mari',
  pronouns: { subject: 'she', object: 'her', possessive: 'her' }
};

console.log('\nA preset carries no resident\n');

eq(
  'the first name becomes {name}',
  depersonalize('Alex prepares a simple meal.', ALEX).text,
  '{name} prepares a simple meal.'
);

eq(
  'the possessive survives the apostrophe',
  depersonalize("Alex's room stays the way Alex likes it.", ALEX).text,
  "{name}'s room stays the way {name} likes it."
);

eq(
  'the surname goes too',
  depersonalize('Rivera goes out weekly.', ALEX).text,
  '{name} goes out weekly.'
);

eq(
  'the full name is consumed whole, not left half-replaced',
  depersonalize('Alex Rivera chooses where to go.', ALEX).text,
  '{name} chooses where to go.'
);

eq(
  'a preferred name is replaced as well as the legal one',
  depersonalize('Mari picks out what to wear.', MARIA).text,
  '{name} picks out what to wear.'
);

eq(
  'each pronoun form gets its own placeholder',
  depersonalize('He hands him his coat.', ALEX).text,
  '{subject} hands {object} {possessive} coat.'
);

check(
  'a capitalised pronoun is reported, because placeholders fill in lowercase',
  depersonalize('He cooks.', ALEX).recasedPronoun
);

check(
  'a name inside another word is left alone',
  depersonalize('Alexandra visits on Tuesdays.', ALEX).text ===
    'Alexandra visits on Tuesdays.'
);

console.log('\nAmbiguity is reported, not guessed at\n');

const ambiguous = depersonalize('Staff hand her her medication.', MARIA);

eq(
  'she/her/her leaves "her" alone rather than picking a placeholder',
  ambiguous.text,
  'Staff hand her her medication.'
);

check('and says which word it left', ambiguous.ambiguous.includes('her'));

check(
  'a reflexive is reported — no placeholder exists for it',
  depersonalize('{name} washes herself.', MARIA).ambiguous.includes('herself')
);

console.log('\nA leftover name blocks the save\n');

check(
  'a name typed back in after substitution is found',
  findNames('{name} cooks with Alex on Sundays.', ALEX).join(',') === 'Alex'
);

check('clean text reports nothing', findNames('{name} cooks on Sundays.', ALEX).length === 0);

check(
  'the specific name is named, not the full name it sits inside',
  findNames('Alex Rivera cooks.', ALEX).join(',') === 'Alex Rivera'
);

// The honest limit, asserted so nobody mistakes this for detection of every
// name. A nickname that is not on the record cannot be found, which is why the
// supervisor reads the text before it saves.
check(
  'a nickname absent from the record is NOT detected (known limit)',
  findNames('Mickey cooks on Sundays.', ALEX).length === 0
);

console.log('\nThe round trip lands on the next person\n');

const THEY = { subject: 'they', object: 'them', possessive: 'their' };

eq(
  'what comes out of one plan reads correctly in another',
  personalize(
    depersonalize("Alex prepares his own meal. Staff hand him the pan.", ALEX).text,
    'Jordan',
    THEY
  ),
  'Jordan prepares their own meal. Staff hand them the pan.'
);

console.log('\nA whole outcome, with its activities\n');

const outcome: Outcome = {
  id: 'o1',
  residentId: 'r1',
  title: "Alex's cooking",
  importantTo: 'Making his own food',
  importantFor: null,
  targetDate: null,
  lens: 'independence',
  statement: 'Alex prepares a simple meal three times a week.',
  supportStrategies: 'Alex does better when the kitchen is quiet.',
  measure: 'Four of five steps unprompted.',
  frequency: '3x per week',
  category: 'Daily living',
  sortOrder: 0,
  active: true,
  startedOn: null,
  endedOn: null
};

const activity: OutcomeActivity = {
  id: 'a1',
  outcomeId: 'o1',
  description: 'Alex prepares a simple meal.',
  measureType: 'skill_building',
  measure: 'Alex completes four of the five steps without a prompt.',
  supportInstructions: 'Set out the ingredients and let him start.',
  dailyQuestion: 'Did Alex prepare a meal today?',
  sortOrder: 0,
  active: true
};

const result = draftPresetFrom(outcome, [activity], ALEX);

eq('the title is de-personalized too', result.draft.title, "{name}'s cooking");
eq(
  'so is every activity field',
  result.draft.activities[0].dailyQuestion,
  'Did {name} prepare a meal today?'
);
eq('the agency category is carried verbatim', result.draft.category, 'Daily living');
check('nothing is left to block the save', result.residualNames.length === 0);
check(
  'no field of the draft still names the person',
  draftTexts(result.draft).every((t) => findNames(t, ALEX).length === 0)
);

// Support strategies and the progress measure are about how this is going for
// this person, and the install path does not write them. The save screen says
// so rather than dropping them quietly; this asserts they are in fact dropped.
check(
  'the outcome-level support notes are not carried into the preset',
  !draftTexts(result.draft).some((t) => t.includes('the kitchen is quiet'))
);

console.log(failures === 0 ? '\nAll good.\n' : `\n${failures} failed.\n`);
process.exit(failures === 0 ? 0 : 1);
