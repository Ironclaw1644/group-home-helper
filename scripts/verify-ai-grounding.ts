/**
 * Live model check against the configured provider.
 *
 *   npm run verify:ai              # default local provider (Ollama)
 *   AI_PROVIDER=anthropic npm run verify:ai
 *   VERIFY_RUNS=5 npm run verify:ai
 *
 * A single passing generation is not evidence for a smaller model, so every
 * case runs several times and the summary reports how many held. What is being
 * checked:
 *
 *   1. Thin input must not grow an outing, a meal, or a visitor.
 *   2. Style-exemplar wording must not be copied in as fact — the failure mode
 *      observed on a 7B model, which lifted "Staff awakened ... and greeted"
 *      straight out of the example.
 *   3. A shift with a recorded concern must not end with the reassuring closer.
 *   4. Latency has to be low enough that a DSP will actually wait for it.
 *
 * To compare cost tiers rather than gate one, use `npm run compare:models`.
 */
import { loadEnv } from './load-env';
import { getProvider } from '../lib/ai/provider';
import { SYSTEM_PROMPT } from '../lib/ai/prompts';
import { finalizeNarrative } from '../lib/ai/postprocess';
import { buildMessage, CASES, evaluateRun } from './grounding-cases';

const RUNS = Number(process.env.VERIFY_RUNS || 3);

async function main() {
  loadEnv();

  const provider = await getProvider();
  const health = await provider.health();

  console.log(`provider: ${provider.name}  model: ${provider.model}`);
  console.log(`health:   ${health.detail}\n`);

  if (!health.ok) {
    console.error('Provider is not ready — skipping live checks.');
    process.exit(2);
  }

  let totalRuns = 0;
  let totalPassed = 0;
  const timings: number[] = [];

  for (const testCase of CASES) {
    console.log(`\n=== ${testCase.title} ===`);
    const message = buildMessage(testCase);

    for (let run = 1; run <= RUNS; run++) {
      const result = await provider.generate(SYSTEM_PROMPT, message);
      totalRuns++;

      if (!result.ok) {
        console.log(`  run ${run}: FAILED (${result.reason}) — ${result.message}`);
        continue;
      }

      // Same pipeline as the route: normalize, then apply the closer the data
      // calls for.
      const narrative = finalizeNarrative(result.draft.narrative, testCase.hasConcern);
      if (result.usage.elapsedSeconds) timings.push(result.usage.elapsedSeconds);

      const problems = evaluateRun(testCase, narrative, result.draft.unsupported_claims);
      const passed = problems.length === 0;
      if (passed) totalPassed++;

      console.log(
        `  run ${run}: ${passed ? 'PASS' : 'FAIL'}  (${result.usage.elapsedSeconds ?? '?'}s)`
      );
      console.log(`    ${narrative}`);
      for (const p of problems) console.log(`    ! ${p}`);
    }
  }

  const median = timings.length
    ? [...timings].sort((a, b) => a - b)[Math.floor(timings.length / 2)]
    : null;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`passed ${totalPassed}/${totalRuns} runs`);
  if (median !== null) {
    console.log(`median latency ${median}s (min ${Math.min(...timings)}s, max ${Math.max(...timings)}s)`);
  }

  // Every run must hold. A note that invents an event is a falsified record,
  // so "usually correct" is not a passing grade.
  const ok = totalPassed === totalRuns && totalRuns > 0;
  console.log(ok ? 'Live grounding checks passed.\n' : 'Live grounding checks FAILED.\n');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
