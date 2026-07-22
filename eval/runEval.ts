/**
 * Eval suite entry point.
 *
 * Two tiers:
 *  1. UNIT checks (always run, no API calls, instant): provider
 *     rotation/error-classification logic + tavily_search payload
 *     construction. These catch regressions in "model swapped"
 *     behavior without spending any quota.
 *  2. LIVE checks (opt-in via `--live`, real API calls against
 *     Tavily + the configured LLM providers): runs representative
 *     prompts through the full `DeepAgentRunner` and asserts on:
 *       - which sub-agent the agent delegated to (routing correctness)
 *       - whether tavily_search was called with recency params for
 *         time-sensitive prompts
 *       - whether the final answer's cited dates fall within the
 *         expected recency window (staleness detection)
 *
 * Usage:
 *   npm run eval            # unit checks only (fast, free)
 *   npm run eval -- --live  # unit checks + live agent runs (uses quota)
 */
import { CONFIG, validateConfig } from '../src/config.js';
import { DatabaseClient } from '../src/db/client.js';
import { DeepAgentRunner } from '../src/agents/deepAgentRunner.js';
import { runProviderSwapChecks, type CheckResult } from './providerSwapChecks.js';
import { runToolPayloadChecks } from './toolPayloadChecks.js';
import { EVAL_CASES, type EvalCase } from './cases.js';
import { EvalCaptureHandler } from './evalCallbackCapture.js';
import { dateAgeSummary, looksStaleByYear } from './dateHeuristics.js';

const LIVE_MODE = process.argv.includes('--live');

function printSection(title: string): void {
  console.log(`\n${'='.repeat(60)}\n${title}\n${'='.repeat(60)}`);
}

function printResults(results: CheckResult[]): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    const icon = r.pass ? '✓' : '✗';
    console.log(`  ${icon} [${r.id}] ${r.detail}`);
    if (r.pass) passed++; else failed++;
  }
  return { passed, failed };
}

async function runUnitChecks(): Promise<{ passed: number; failed: number }> {
  printSection('UNIT CHECKS — Provider rotation & error classification (no API calls)');
  const providerResults = runProviderSwapChecks();
  const providerTotals = printResults(providerResults);

  printSection('UNIT CHECKS — tavily_search recency-param forwarding (mocked fetch)');
  const toolResults = await runToolPayloadChecks();
  const toolTotals = printResults(toolResults);

  return {
    passed: providerTotals.passed + toolTotals.passed,
    failed: providerTotals.failed + toolTotals.failed,
  };
}

/** Runs one eval case through the real DeepAgentRunner and returns pass/fail checks. */
async function runLiveCase(runner: DeepAgentRunner, evalCase: EvalCase, capture: EvalCaptureHandler): Promise<CheckResult[]> {
  capture.reset();
  const results: CheckResult[] = [];

  let finalText = '';
  try {
    const result = await runner.run(evalCase.prompt);
    finalText = result.finalText;
  } catch (error) {
    results.push({
      id: `${evalCase.id}-completed-without-error`,
      pass: false,
      detail: `Run threw: ${error instanceof Error ? error.message : String(error)}`,
    });
    return results;
  }

  // Routing check: was the expected sub-agent invoked at least once?
  const invokedExpectedSubagent = capture.toolNames().includes(evalCase.expectedSubagent);
  results.push({
    id: `${evalCase.id}-routed-to-${evalCase.expectedSubagent}`,
    pass: invokedExpectedSubagent,
    detail: invokedExpectedSubagent
      ? `Correctly delegated to '${evalCase.expectedSubagent}'.`
      : `Expected delegation to '${evalCase.expectedSubagent}', but observed tool calls were: ${[...new Set(capture.toolNames())].join(', ') || '(none)'}`,
  });

  // Recency-param check: for recency categories, tavily_search should have been called with topic:'news'.
  if (evalCase.category !== 'stale-ok') {
    const searchCalls = capture.callsFor('tavily_search');
    const usedNewsTopic = searchCalls.some((c) => c.input.topic === 'news');
    results.push({
      id: `${evalCase.id}-tavily-search-used-news-topic`,
      pass: usedNewsTopic || searchCalls.length === 0,
      detail: searchCalls.length === 0
        ? 'tavily_search was not called directly by the main agent (likely delegated entirely to sub-agent — acceptable).'
        : usedNewsTopic
          ? "tavily_search called with topic:'news' as expected for a time-sensitive query."
          : `tavily_search was called but WITHOUT topic:'news': ${JSON.stringify(searchCalls.map((c) => c.input))}`,
    });
  }

  // Staleness check on the final answer text.
  if (evalCase.maxAgeDays !== undefined) {
    const ageSummary = dateAgeSummary(finalText);
    const stale = looksStaleByYear(finalText);
    const withinWindow = ageSummary ? ageSummary.newestDays <= evalCase.maxAgeDays : true; // no explicit dates found -> can't disprove freshness
    results.push({
      id: `${evalCase.id}-answer-not-stale`,
      pass: withinWindow && !stale,
      detail: ageSummary
        ? `Newest cited date is ${ageSummary.newestDays} day(s) old (limit ${evalCase.maxAgeDays}). Stale-by-year heuristic: ${stale}.`
        : `No explicit dates found in the final answer to verify recency (heuristic year-check: stale=${stale}). Manually review: "${finalText.slice(0, 200)}..."`,
    });
  }

  return results;
}

async function runLiveChecks(): Promise<{ passed: number; failed: number }> {
  printSection('LIVE CHECKS — real agent runs against representative prompts (uses API quota)');
  validateConfig();
  const db = new DatabaseClient(CONFIG.NEON_DATABASE_URL);
  const capture = new EvalCaptureHandler();
  const runner = new DeepAgentRunner(db, { callbacks: [capture] });

  let passed = 0;
  let failed = 0;

  for (const evalCase of EVAL_CASES) {
    console.log(`\n--- Case: ${evalCase.id} (${evalCase.category}) ---`);
    console.log(`Prompt: "${evalCase.prompt}"`);
    const caseResults = await runLiveCase(runner, evalCase, capture);
    const totals = printResults(caseResults);
    passed += totals.passed;
    failed += totals.failed;
  }

  return { passed, failed };
}

async function main() {
  console.log('Freetier Deep Agent Framework — Eval Suite');
  console.log(LIVE_MODE ? 'Mode: unit + live checks' : 'Mode: unit checks only (pass --live to also run live agent checks)');

  const unitTotals = await runUnitChecks();
  let liveTotals = { passed: 0, failed: 0 };
  if (LIVE_MODE) {
    liveTotals = await runLiveChecks();
  }

  const totalPassed = unitTotals.passed + liveTotals.passed;
  const totalFailed = unitTotals.failed + liveTotals.failed;

  printSection('SUMMARY');
  console.log(`  Passed: ${totalPassed}`);
  console.log(`  Failed: ${totalFailed}`);
  if (!LIVE_MODE) {
    console.log(`  (Live routing/recency checks skipped — rerun with '--live' to exercise real agent runs.)`);
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main();
