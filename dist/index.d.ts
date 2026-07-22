import { CONFIG, validateConfig } from './config.js';
import { DatabaseClient } from './db/client.js';
import { DeepAgentRunner, type DeepAgentRunnerOptions, type RunResult } from './agents/deepAgentRunner.js';
import { buildDefaultSubagents, buildResearchSubagent, buildVisionSubagent, buildLiveDataSubagent, type SubagentDef } from './agents/subagentFactory.js';
/**
 * Library entry point for callers embedding this framework (e.g. a
 * specialized orchestrator wrapping `DeepAgentRunner` for its own
 * domain — see README "Using as a library"). Re-exported here so
 * consumers only need to `import { DeepAgentRunner, ... } from
 * 'freetier-deepagent-framework'` rather than reaching into `src/`.
 */
export { DatabaseClient, DeepAgentRunner, buildDefaultSubagents, buildResearchSubagent, buildVisionSubagent, buildLiveDataSubagent, validateConfig, CONFIG };
export type { DeepAgentRunnerOptions, RunResult, SubagentDef };
