import { DynamicStructuredTool } from '@langchain/core/tools';
import type { LanguageModelLike } from '@langchain/core/language_models/base';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { AgentMiddleware } from 'langchain';
/** Minimal shape `deepagents`' subagent config expects. */
export interface SubagentDef {
    name: string;
    description: string;
    systemPrompt: string;
    tools: DynamicStructuredTool[];
    model: LanguageModelLike;
    middleware?: AgentMiddleware[];
}
/**
 * Sub-agent definitions for `deepagents`' subagent config, used for
 * parallel task decomposition. Each sub-agent gets its own
 * `FreeTierChatModel` instance (backed by `@freetier/orchestrator`) so
 * sub-agent LLM calls never compete for the main deep agent's
 * NVIDIA/HuggingFace/OpenRouter quota, and each sub-agent's provider
 * rotation/cooldown state stays isolated from its siblings.
 *
 * IMPORTANT (state-corruption avoidance): sub-agents are stateless
 * workers — they receive a task description, use their own tools, and
 * return a plain-text/JSON result to the parent deep agent. They never
 * write directly to the durable StateStore; only the parent deep agent
 * (single writer) persists todo/provider state after a sub-agent's
 * result comes back. This avoids concurrent writers corrupting run
 * state when several sub-agents complete around the same time.
 */
/**
 * For content where a cached/stale snapshot is acceptable — blogs,
 * articles, tutorials, documentation, past events/history. Do NOT use
 * this for time-sensitive facts (live scores, prices, weather, AQI);
 * see `buildLiveDataSubagent` for that.
 */
export declare function buildResearchSubagent(callbacks?: BaseCallbackHandler[]): SubagentDef;
/**
 * For UI/screenshot analysis and for data extraction off rendered
 * pages (JS-heavy pages, dashboards, charts).
 */
export declare function buildVisionSubagent(callbacks?: BaseCallbackHandler[]): SubagentDef;
/**
 * For fast-changing real-time facts (live scores, stock prices,
 * current weather, AQI, etc.) where Tavily's cached index may be
 * stale. Strategy: use tavily_search only to find the freshest
 * authoritative URL, then use vision_scrape to read the live value
 * directly off the rendered page. Kept as a distinct sub-agent (rather
 * than folded into research-subagent) so the parent deep agent has an
 * unambiguous choice between "stale-tolerant research" and
 * "real-time lookup" instead of one sub-agent trying to do both.
 */
export declare function buildLiveDataSubagent(callbacks?: BaseCallbackHandler[]): SubagentDef;
/**
 * Default first-class sub-agents. Callers embedding this framework can
 * merge their own additional `SubagentDef`s with these (see
 * `DeepAgentRunner`'s `extraSubagents` option) rather than being
 * limited to only what's built in here.
 */
export declare function buildDefaultSubagents(callbacks?: BaseCallbackHandler[]): SubagentDef[];
