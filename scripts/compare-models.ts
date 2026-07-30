/**
 * Price and grade each model tier on the actual job.
 *
 *   npm run compare:models
 *   COMPARE_RUNS=5 npm run compare:models
 *   COMPARE_MODELS=claude-haiku-4-5-20251001,claude-sonnet-5 npm run compare:models
 *
 * "Cheapest that works" is an empirical question, not a spec-sheet one. This
 * runs the same grounding cases `verify:ai` gates on against several models and
 * reports pass rate, latency, and the monthly bill at this house's volume, so
 * the cost tier is chosen against measured behavior.
 *
 * A model that fails even one run is not a candidate at any price: an invented
 * event in a Medicaid record is a falsified document.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SYSTEM_PROMPT } from '../lib/ai/prompts';
import { finalizeNarrative } from '../lib/ai/postprocess';
import { buildMessage, CASES, evaluateRun } from './grounding-cases';

const RUNS = Number(process.env.COMPARE_RUNS || 3);

/** Notes per month: residents × shifts/day × days. Override for a bigger house. */
const RESIDENTS = Number(process.env.COMPARE_RESIDENTS || 6);
const SHIFTS_PER_DAY = Number(process.env.COMPARE_SHIFTS || 2);
const NOTES_PER_MONTH = RESIDENTS * SHIFTS_PER_DAY * 30;

/** USD per million tokens. */
type Price = { input: number; output: number };

const PRICING: Record<string, Price> = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus-5': { input: 5, output: 25 }
};

const DEFAULT_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-5',
  'claude-opus-5'
];

function loadEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    if (!process.env[key]) process.env[key] = line.slice(i + 1).trim();
  }
}

type Row = {
  model: string;
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

async function measure(model: string): Promise<Row> {
  const { anthropicProvider } = await import('../lib/ai/anthropic');
  const provider = anthropicProvider(model);

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

  const price = PRICING[model];
  let costPerNote: number | null = null;
  if (price && (avgInput || avgOutput)) {
    // Cached prefix reads bill at 10% of the input rate; the system prompt is
    // the same on every note, so in steady state most input is cache reads.
    const freshInput = Math.max(0, avgInput - avgCacheRead);
    costPerNote =
      (freshInput / 1_000_000) * price.input +
      (avgCacheRead / 1_000_000) * price.input * 0.1 +
      (avgOutput / 1_000_000) * price.output;
  }

  return {
    model,
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

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set — nothing to compare.');
    process.exit(2);
  }

  const models = (process.env.COMPARE_MODELS || DEFAULT_MODELS.join(','))
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  console.log(`Comparing ${models.length} models — ${CASES.length} cases x ${RUNS} runs each`);
  console.log(`Volume assumption: ${RESIDENTS} residents x ${SHIFTS_PER_DAY} shifts x 30 days`);
  console.log(`                   = ${NOTES_PER_MONTH} notes/month\n`);

  const rows: Row[] = [];
  for (const model of models) {
    console.log(`--- ${model}`);
    rows.push(await measure(model));
  }

  const usd = (n: number | null) =>
    n === null ? '     ?' : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;

  console.log(`\n${'='.repeat(78)}`);
  console.log(
    'model'.padEnd(30) +
      'grounding'.padEnd(12) +
      'median'.padEnd(9) +
      'per note'.padEnd(11) +
      'per month'
  );
  console.log('-'.repeat(78));

  for (const r of rows) {
    const rate = `${r.passed}/${r.total}`;
    console.log(
      r.model.padEnd(30) +
        rate.padEnd(12) +
        `${r.medianSeconds ?? '?'}s`.padEnd(9) +
        usd(r.costPerNote).padEnd(11) +
        usd(r.monthly)
    );
  }
  console.log('='.repeat(78));

  console.log('\ntoken averages (input / cache read / output):');
  for (const r of rows) {
    console.log(
      `  ${r.model.padEnd(30)} ${Math.round(r.avgInput)} / ${Math.round(r.avgCacheRead)} / ${Math.round(r.avgOutput)}`
    );
  }

  const failing = rows.filter((r) => r.passed < r.total);
  if (failing.length) {
    console.log('\nfailures:');
    for (const r of failing) {
      console.log(`\n  ${r.model}`);
      for (const f of r.failures.slice(0, 6)) console.log(`    ! ${f}`);
      if (r.failures.length > 6) console.log(`    ... and ${r.failures.length - 6} more`);
    }
  }

  const clean = rows.filter((r) => r.passed === r.total && r.costPerNote !== null);
  if (clean.length) {
    const cheapest = clean.reduce((a, b) => (a.costPerNote! <= b.costPerNote! ? a : b));
    console.log(
      `\nCheapest model that passed every run: ${cheapest.model} ` +
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
