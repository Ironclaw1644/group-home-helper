/**
 * Price and grade each model tier on the actual job.
 *
 *   npm run compare:models
 *   COMPARE_RUNS=5 npm run compare:models
 *   COMPARE_MODELS=gpt-4o-mini,claude-haiku-4-5-20251001 npm run compare:models
 *
 * "Cheapest that works" is an empirical question, not a spec-sheet one. This
 * runs the same grounding cases `verify:ai` gates on against several models —
 * across vendors — and reports pass rate, latency, and the monthly bill at this
 * house's volume, so the cost tier is chosen against measured behavior.
 *
 * A model that fails even one run is not a candidate at any price: an invented
 * event in a Medicaid record is a falsified document.
 *
 * Models whose key is missing are skipped rather than counted as failures.
 */
import { loadEnv } from './load-env';
import { SYSTEM_PROMPT } from '../lib/ai/prompts';
import { finalizeNarrative } from '../lib/ai/postprocess';
import type { ModelProvider } from '../lib/ai/provider';
import { buildMessage, CASES, evaluateRun } from './grounding-cases';

const RUNS = Number(process.env.COMPARE_RUNS || 3);

/** Notes per month: residents × shifts/day × days. Override for a bigger house. */
const RESIDENTS = Number(process.env.COMPARE_RESIDENTS || 6);
const SHIFTS_PER_DAY = Number(process.env.COMPARE_SHIFTS || 2);
const NOTES_PER_MONTH = RESIDENTS * SHIFTS_PER_DAY * 30;

type Vendor = 'anthropic' | 'openai' | 'local';

type Candidate = {
  id: string;
  vendor: Vendor;
  /** USD per million tokens. Null for local models, which cost nothing. */
  price: { input: number; output: number } | null;
  /** Fraction of the input price charged for a cached prefix read. */
  cacheDiscount: number;
};

/**
 * List prices, USD per million tokens.
 *
 * These move. The script reports measured token counts alongside the cost it
 * derives, so a stale price here is visible rather than silently wrong — and
 * the pass rate, which is the part that actually disqualifies a model, does not
 * depend on this table at all.
 */
const CANDIDATES: Candidate[] = [
  // Anthropic — cached prefix reads bill at 10% of input.
  { id: 'claude-haiku-4-5-20251001', vendor: 'anthropic', price: { input: 1, output: 5 }, cacheDiscount: 0.1 },
  { id: 'claude-sonnet-5', vendor: 'anthropic', price: { input: 3, output: 15 }, cacheDiscount: 0.1 },
  { id: 'claude-opus-5', vendor: 'anthropic', price: { input: 5, output: 25 }, cacheDiscount: 0.1 },

  // OpenAI — automatic prefix caching, cached input billed at a discount.
  // Confirm current model names and prices before relying on the cost column;
  // the OpenAI lineup turns over faster than this file does.
  { id: 'gpt-4o-mini', vendor: 'openai', price: { input: 0.15, output: 0.6 }, cacheDiscount: 0.5 },
  { id: 'gpt-4o', vendor: 'openai', price: { input: 2.5, output: 10 }, cacheDiscount: 0.5 },

  // Local — free, and the baseline everything else has to beat on value.
  { id: 'qwen2.5:7b', vendor: 'local', price: null, cacheDiscount: 0 }
];

async function providerFor(candidate: Candidate): Promise<ModelProvider> {
  switch (candidate.vendor) {
    case 'anthropic': {
      const { anthropicProvider } = await import('../lib/ai/anthropic');
      return anthropicProvider(candidate.id);
    }
    case 'openai': {
      const { openaiProvider } = await import('../lib/ai/openai');
      return openaiProvider(candidate.id);
    }
    default: {
      process.env.OLLAMA_MODEL = candidate.id;
      const { ollamaProvider } = await import('../lib/ai/ollama');
      return ollamaProvider();
    }
  }
}

type Row = {
  id: string;
  vendor: Vendor;
  passed: number;
  total: number;
  medianSeconds: number | null;
  avgInput: number;
  avgOutput: number;
  avgCacheRead: number;
  costPerNote: number | null;
  monthly: number | null;
  failures: string[];
};

async function measure(candidate: Candidate): Promise<Row | null> {
  const provider = await providerFor(candidate);
  const health = await provider.health();

  if (!health.ok) {
    console.log(`  skipped — ${health.detail}`);
    return null;
  }

  let passed = 0;
  let total = 0;
  const timings: number[] = [];
  const inputs: number[] = [];
  const outputs: number[] = [];
  const cacheReads: number[] = [];
  const failures: string[] = [];

  for (const testCase of CASES) {
    const message = buildMessage(testCase);

    for (let run = 1; run <= RUNS; run++) {
      const result = await provider.generate(SYSTEM_PROMPT, message);
      total++;

      if (!result.ok) {
        failures.push(`${testCase.title}: ${result.reason} — ${result.message}`);
        process.stdout.write('!');
        continue;
      }

      const narrative = finalizeNarrative(result.draft.narrative, testCase.hasConcern);
      const problems = evaluateRun(testCase, narrative, result.draft.unsupported_claims);

      if (result.usage.elapsedSeconds) timings.push(result.usage.elapsedSeconds);
      if (result.usage.inputTokens) inputs.push(result.usage.inputTokens);
      if (result.usage.outputTokens) outputs.push(result.usage.outputTokens);
      cacheReads.push(result.usage.cacheReadTokens ?? 0);

      if (problems.length === 0) {
        passed++;
      } else {
        failures.push(`${testCase.title}: ${problems.join('; ')}`);
      }
      process.stdout.write(problems.length === 0 ? '.' : 'x');
    }
  }
  process.stdout.write('\n');

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const median = timings.length
    ? [...timings].sort((a, b) => a - b)[Math.floor(timings.length / 2)]
    : null;

  const avgInput = mean(inputs);
  const avgOutput = mean(outputs);
  const avgCacheRead = mean(cacheReads);

  let costPerNote: number | null = null;
  if (candidate.price === null) {
    costPerNote = 0;
  } else if (avgInput || avgOutput) {
    const freshInput = Math.max(0, avgInput - avgCacheRead);
    costPerNote =
      (freshInput / 1_000_000) * candidate.price.input +
      (avgCacheRead / 1_000_000) * candidate.price.input * candidate.cacheDiscount +
      (avgOutput / 1_000_000) * candidate.price.output;
  }

  return {
    id: candidate.id,
    vendor: candidate.vendor,
    passed,
    total,
    medianSeconds: median,
    avgInput,
    avgOutput,
    avgCacheRead,
    costPerNote,
    monthly: costPerNote === null ? null : costPerNote * NOTES_PER_MONTH,
    failures
  };
}

async function main() {
  loadEnv();

  const requested = process.env.COMPARE_MODELS?.split(',').map((m) => m.trim()).filter(Boolean);
  const candidates = requested
    ? requested.map((id) => {
        const known = CANDIDATES.find((c) => c.id === id);
        if (known) return known;
        // An unlisted model still runs; it just cannot be priced.
        const vendor: Vendor = id.startsWith('claude')
          ? 'anthropic'
          : id.startsWith('gpt') || id.startsWith('o')
            ? 'openai'
            : 'local';
        return { id, vendor, price: null, cacheDiscount: 0 } satisfies Candidate;
      })
    : CANDIDATES;

  console.log(`Comparing ${candidates.length} models — ${CASES.length} cases x ${RUNS} runs each`);
  console.log(`Volume assumption: ${RESIDENTS} residents x ${SHIFTS_PER_DAY} shifts x 30 days`);
  console.log(`                   = ${NOTES_PER_MONTH} notes/month\n`);

  const rows: Row[] = [];
  for (const candidate of candidates) {
    console.log(`--- ${candidate.id} (${candidate.vendor})`);
    const row = await measure(candidate);
    if (row) rows.push(row);
  }

  if (rows.length === 0) {
    console.log('\nNothing ran. Set ANTHROPIC_API_KEY / OPENAI_API_KEY, or start Ollama.\n');
    process.exit(2);
  }

  const usd = (n: number | null) =>
    n === null ? '     ?' : n === 0 ? 'free' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;

  console.log(`\n${'='.repeat(80)}`);
  console.log(
    'model'.padEnd(30) +
      'grounding'.padEnd(12) +
      'median'.padEnd(9) +
      'per note'.padEnd(11) +
      'per month'
  );
  console.log('-'.repeat(80));

  for (const r of rows) {
    console.log(
      r.id.padEnd(30) +
        `${r.passed}/${r.total}`.padEnd(12) +
        `${r.medianSeconds ?? '?'}s`.padEnd(9) +
        usd(r.costPerNote).padEnd(11) +
        usd(r.monthly)
    );
  }
  console.log('='.repeat(80));

  console.log('\ntoken averages (input / cached / output):');
  for (const r of rows) {
    console.log(
      `  ${r.id.padEnd(30)} ${Math.round(r.avgInput)} / ${Math.round(r.avgCacheRead)} / ${Math.round(r.avgOutput)}`
    );
  }

  const failing = rows.filter((r) => r.passed < r.total);
  if (failing.length) {
    console.log('\nfailures:');
    for (const r of failing) {
      console.log(`\n  ${r.id}`);
      for (const f of r.failures.slice(0, 6)) console.log(`    ! ${f}`);
      if (r.failures.length > 6) console.log(`    ... and ${r.failures.length - 6} more`);
    }
  }

  const clean = rows.filter((r) => r.passed === r.total && r.costPerNote !== null);
  if (clean.length) {
    const cheapest = clean.reduce((a, b) => (a.costPerNote! <= b.costPerNote! ? a : b));
    console.log(
      `\nCheapest model that passed every run: ${cheapest.id} ` +
        `(${usd(cheapest.monthly)}/month at ${NOTES_PER_MONTH} notes)\n`
    );
  } else {
    console.log('\nNo model passed every run. Do not ship any of these unattended.\n');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
