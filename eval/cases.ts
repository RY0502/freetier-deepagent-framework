/**
 * Eval case definitions for the recency/routing eval suite.
 *
 * Each case is a realistic user prompt paired with assertions about
 * *how* the agent should have solved it (which sub-agent/tool it
 * should have delegated to, and whether the final answer's dates fall
 * within an acceptable recency window). These are behavioral/routing
 * checks on top of the live system, not unit tests of pure functions.
 */
export type EvalCategory = 'recency-news' | 'recency-fact' | 'stale-ok';

export interface EvalCase {
  id: string;
  category: EvalCategory;
  prompt: string;
  /** Sub-agent name the parent deep agent is expected to delegate to. */
  expectedSubagent: 'live-data-subagent' | 'research-subagent' | 'vision-subagent';
  /** For recency cases: max age (in days) a cited/extracted date may have. */
  maxAgeDays?: number;
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: 'today-ai-news',
    category: 'recency-news',
    prompt: 'Research the top 3 AI news stories today and summarize them.',
    expectedSubagent: 'live-data-subagent',
    maxAgeDays: 1,
  },
  {
    id: 'current-stock-price',
    category: 'recency-fact',
    prompt: 'What is the current stock price of Tesla (TSLA)?',
    expectedSubagent: 'live-data-subagent',
    maxAgeDays: 1,
  },
  {
    id: 'latest-weather',
    category: 'recency-fact',
    prompt: "What is the current weather and AQI in Delhi right now?",
    expectedSubagent: 'live-data-subagent',
    maxAgeDays: 1,
  },
  {
    id: 'history-of-transformers',
    category: 'stale-ok',
    prompt: 'Give me a summary of the history of the Transformer architecture in deep learning.',
    expectedSubagent: 'research-subagent',
  },
  {
    id: 'tutorial-request',
    category: 'stale-ok',
    prompt: 'Find a good tutorial explaining how LangChain agents work and summarize the key steps.',
    expectedSubagent: 'research-subagent',
  },
];
