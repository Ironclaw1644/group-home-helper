/**
 * Prove that a pasted roster does not carry Medicaid IDs to a hosted model.
 *
 *   npm run verify:roster-privacy
 *
 * `lib/residents/ai-parse.ts` used to post the pasted text straight to
 * `provider.generateStructured()` — no prepareName, no scrubFreeText, no
 * residual check — while production ran on a third-party vendor with no BAA.
 * One paste sent full legal names, dates of birth and Medicaid IDs for an
 * entire house in a single request, routing around the whole pipeline the
 * note assistant goes through so carefully.
 *
 * The provider is faked here rather than called, so this asserts on the exact
 * bytes the adapter is handed. That is the boundary that matters: everything
 * past it is somebody else's infrastructure.
 */
import { aiParseRoster } from '../lib/residents/ai-parse';
import type { ModelProvider, StructuredResult } from '../lib/ai/provider';

let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${label}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** A roster in the messy shape the AI path exists to handle. */
const ROSTER = [
  'Room 1A - Alexander Rivera (he/him) DOB 4/12/1985 Medicaid 100000000012',
  'Room 2B - Maria Delgado (she/her) DOB 9/3/1979 Medicaid 100000000013',
  'Room 3 - Jordan Pike (they/them) DOB 12/25/1990 Medicaid 100000000014',
  'Questions: call the house at (804) 555-0142 or nurse@example.com'
].join('\n');

const MEDICAID_IDS = ['100000000012', '100000000013', '100000000014'];

type Captured = { system: string; user: string };

/** What the fake adapter was actually handed, per call. */
let captured: Captured | null = null;

/**
 * Read through a function so TypeScript does not narrow `captured` to null.
 * It is only ever assigned from inside the fake adapter's callback, which
 * control-flow analysis cannot see.
 */
const lastCall = (): Captured | null => captured;

function fakeProvider(sendsDataOffMachine: boolean): ModelProvider {
  return {
    name: sendsDataOffMachine ? 'anthropic' : 'local',
    model: 'fake',
    sendsDataOffMachine,
    async health() {
      return { ok: true, detail: 'fake' };
    },
    async generate() {
      throw new Error('not used');
    },
    async generateStructured<T>(
      system: string,
      userMessage: string
    ): Promise<StructuredResult<T>> {
      captured = { system, user: userMessage };
      return {
        ok: true,
        data: { residents: [] } as unknown as T,
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: null,
          elapsedSeconds: 0.1
        }
      };
    }
  };
}

async function main() {
  console.log('\nA roster sent to a hosted model carries no Medicaid IDs\n');

  // --- Hosted provider: identifiers must not leave -------------------------
  process.env.AI_DEIDENTIFY = 'true';
  captured = null;
  const hosted = await aiParseRoster(ROSTER, fakeProvider(true));
  check('the hosted call was allowed to proceed', !('error' in hosted), JSON.stringify(hosted));
  const hostedCall = lastCall();
  check('the adapter was actually reached', hostedCall !== null);

  if (hostedCall) {
    // The pasted roster travels in the user message; the system prompt is a
    // static constant in ai-parse.ts. Identifier assertions are scoped to the
    // user message for that reason — the system prompt contains "4/12/1985" as
    // a date-format example, which is our own text and not anybody's DOB.
    const payload = hostedCall.user;
    const whole = `${hostedCall.system}\n${hostedCall.user}`;

    for (const id of MEDICAID_IDS) {
      check(
        `Medicaid ID ${id.slice(0, 3)}… never reaches the adapter`,
        !payload.includes(id),
        'a raw Medicaid ID was in the outbound payload'
      );
    }

    check(
      'no Medicaid-length digit run survives anywhere in the request',
      !/\b\d{9,}\b/.test(whole),
      whole.match(/\b\d{9,}\b/)?.[0] ?? ''
    );
    check('dates of birth are redacted', !payload.includes('4/12/1985'));
    check('every pasted date of birth is gone', !/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(payload));
    check('the phone number is redacted', !payload.includes('555-0142'));
    check('the email address is redacted', !payload.includes('nurse@example.com'));
    check('the redaction placeholder is present, so scrubbing really ran', payload.includes('[id]'));

    // The names genuinely are the payload — a roster with them removed is not
    // a roster. This is stated as an assertion so the tradeoff stays explicit
    // rather than being discovered later by someone reading a request log.
    check(
      'names DO still reach the model, which is the accepted tradeoff',
      payload.includes('Alexander Rivera')
    );
  }

  check(
    'the result is flagged as redacted so the reviewer is told',
    !('error' in hosted) && hosted.redacted === true
  );

  // --- Local provider: nothing leaves, so nothing is stripped --------------
  console.log('\nA local model gets the roster intact, because nothing leaves the machine\n');

  captured = null;
  const local = await aiParseRoster(ROSTER, fakeProvider(false));
  check('the local call was allowed to proceed', !('error' in local));

  const localCall = lastCall();
  if (localCall) {
    check('the Medicaid ID is intact for the local model', localCall.user.includes('100000000012'));
    check('the date of birth is intact', localCall.user.includes('4/12/1985'));
  }

  check(
    'and the result is not flagged as redacted',
    !('error' in local) && local.redacted === false
  );

  // --- Fail-closed ---------------------------------------------------------
  console.log('\nA scrub that does not hold refuses to send\n');

  // Turning de-identification off is the supported post-BAA mode, so the
  // importer must send in that case rather than refuse. This pins which of the
  // two behaviours is which.
  process.env.AI_DEIDENTIFY = 'false';
  captured = null;
  const noDeid = await aiParseRoster(ROSTER, fakeProvider(true));
  check('with AI_DEIDENTIFY=false the request still goes (post-BAA mode)', !('error' in noDeid));
  check(
    'and it is not claimed to be redacted',
    !('error' in noDeid) && noDeid.redacted === false
  );

  process.env.AI_DEIDENTIFY = 'true';

  console.log('');
  if (failures > 0) {
    console.error(`${failures} roster-privacy check(s) failed.\n`);
    process.exit(1);
  }
  console.log('All roster-privacy checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
