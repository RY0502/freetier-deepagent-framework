import { DatabaseClient } from '../db/client.js';
import { type ProviderName } from '../providers/providerManager.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { type SubagentDef } from './subagentFactory.js';
/**
 * Extension points for callers embedding this framework (e.g. a
 * specialized agent wrapping `DeepAgentRunner` for its own domain).
 * Extra tools/sub-agents are merged with the framework's built-in
 * defaults rather than replacing them, so callers only need to supply
 * what's beyond the built-ins.
 */
export interface DeepAgentRunnerOptions {
    extraTools?: DynamicStructuredTool[];
    extraSubagents?: SubagentDef[];
    /**
     * Domain-specific policy/rules appended to the framework's base
     * system prompt as a "## Domain rules" section (e.g. "never place a
     * trade without explicit confirmation"). Does not replace the
     * framework's planning/tool-disambiguation rules — layered on top.
     */
    systemPromptExtension?: string;
    /**
     * LangChain callback handlers (e.g. a metrics/cost-tracking sink)
     * attached to every agent run. Receives standard LangChain
     * lifecycle events (on_llm_*, on_tool_*, on_chain_*) for per-call
     * latency/token/cost observability, distinct from the coarse
     * provider-switch audit log in `agent_events`.
     */
    callbacks?: BaseCallbackHandler[];
}
export interface RunResult {
    promptHash: string;
    finalText: string;
    providerUsed: ProviderName;
}
/**
 * Orchestrates a single user task end-to-end:
 * 1. Hash the prompt -> load or create durable run/todo state (Neon).
 * 2. Build a deep agent using the current provider's GLM model.
 * 3. Stream execution, persisting todo updates to Neon as they occur.
 * 4. On quota exhaustion, switch to the next provider and rebuild the
 *    deep agent with the *same* thread_id/backend/checkpointer so the
 *    new provider resumes from the exact last-completed todo.
 * 5. Repeat until success, or until all providers are exhausted.
 */
export declare class DeepAgentRunner {
    private readonly stateStore;
    private readonly checkpointer;
    private readonly backend;
    private readonly extraTools;
    private readonly extraSubagents;
    private readonly systemPromptExtension?;
    private readonly callbacks;
    /**
     * @param options.extraTools Additional tools merged with the
     *   framework's built-in tools (tavily_search/crawl, vision_scrape,
     *   analyze_page_components) — e.g. a domain-specific API client tool
     *   for a specialized caller (stock-trading data, image-gen, etc.).
     * @param options.extraSubagents Additional `SubagentDef`s merged with
     *   the built-in research/vision/live-data sub-agents. Useful for
     *   giving a specialized caller its own parallelizable sub-agent
     *   without having to fork this framework.
     */
    constructor(db: DatabaseClient, options?: DeepAgentRunnerOptions);
    run(userPrompt: string): Promise<RunResult>;
    private executeWithProvider;
    /** Normalizes the varying shapes a LangGraph stream chunk can take. */
    private extractState;
}
