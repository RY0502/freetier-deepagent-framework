import { type BackendProtocolV2 } from 'deepagents';
import { todoListMiddleware, type AgentMiddleware } from 'langchain';
import { DatabaseClient } from '../db/client.js';
import { type ProviderName } from '../providers/providerManager.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { type SubagentDef } from './subagentFactory.js';
export declare const TodoListMiddleware: typeof todoListMiddleware;
export type BackendProtocol = BackendProtocolV2;
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
     * Additional middleware to attach to the deep agent.
     * `TodoListMiddleware` is automatically prepended to preserve todo list management
     * (since `deepagents` v0.7 no longer includes it by default).
     */
    extraMiddleware?: AgentMiddleware[];
    /** Alias for extraMiddleware */
    middleware?: AgentMiddleware[];
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
    /**
     * Caller-supplied LLM model (e.g. `ChatCerebras`, `ChatOpenAI`).
     * When provided, the framework uses this model directly instead of
     * the built-in NVIDIA → OpenRouter → HuggingFace provider rotation.
     * Provider-switch / quota-exhaustion logic is skipped — the caller
     * is responsible for their own model's availability and retries.
     * Useful for projects that already have a preferred LLM provider.
     */
    model?: BaseLanguageModel;
    /**
     * Max LangGraph super-steps per stream() call before throwing
     * GraphRecursionError, passed through to the underlying agent's
     * `stream()` config. Defaults to 100. Long-running domain tasks with
     * many sequential tool calls per run (e.g. dozens of per-scene tool
     * calls in a video-generation pipeline) may need a higher value.
     */
    recursionLimit?: number;
    /**
     * Filesystem/storage backend instance (concrete `BackendProtocol` instance).
     * Defaults to `new FilesystemBackend()`. If using `StoreBackend`, ensure
     * an explicit `namespace` is specified (e.g. `new StoreBackend({ namespace: ['user', userId] })`).
     */
    backend?: BackendProtocol;
}
export interface RunResult {
    promptHash: string;
    finalText: string;
    providerUsed: ProviderName | 'custom';
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
    private readonly extraMiddleware;
    private readonly systemPromptExtension?;
    private readonly callbacks;
    private readonly customModel?;
    private readonly recursionLimit;
    /**
     * @param options.extraTools Additional tools merged with the
     *   framework's built-in tools (tavily_search/crawl, vision_scrape,
     *   analyze_page_components) — e.g. a domain-specific API client tool
     *   for a specialized caller (stock-trading data, image-gen, etc.).
     * @param options.extraSubagents Additional `SubagentDef`s merged with
     *   the built-in research/vision/live-data sub-agents. Useful for
     *   giving a specialized caller its own parallelizable sub-agent
     *   without having to fork this framework.
     * @param options.backend Concrete BackendProtocol instance (defaults to new FilesystemBackend()).
     * @param options.extraMiddleware Additional middleware appended after TodoListMiddleware.
     */
    constructor(db: DatabaseClient, options?: DeepAgentRunnerOptions);
    run(userPrompt: string): Promise<RunResult>;
    /**
     * Run using the caller-supplied custom model. No provider rotation:
     * errors propagate directly to the caller.
     */
    private runWithCustomModel;
    /**
     * Run using the built-in NVIDIA → AnyApi → Requesty → OpenRouter → HuggingFace
     * rotation. NVIDIA exhausts its configured key pool before moving to AnyApi,
     * and AnyApi exhausts its configured key pool before moving to Requesty.
     * On quota exhaustion, or on Requesty-specific transient failures, switches
     * to the next key/provider and rebuilds the deep agent with the same
     * thread/checkpointer/backend.
     */
    private runWithProviderRotation;
    /**
     * Shared execution logic: builds a deep agent with the given model,
     * streams it, and persists todo state as it progresses.
     */
    private executeWithModel;
    /** Normalizes the varying shapes a LangGraph stream chunk can take. */
    private extractState;
}
