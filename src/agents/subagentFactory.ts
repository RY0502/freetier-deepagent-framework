import { DynamicStructuredTool } from '@langchain/core/tools';
import type { LanguageModelLike } from '@langchain/core/language_models/base';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { FreeTierChatModel } from '../providers/freeTierChatModel.js';
import { createTavilySearchTool, createTavilyCrawlTool } from '../tools/tavilyTools.js';
import { createVisionScrapeTool, createPageAnalysisTool } from '../tools/visionScrapeTool.js';

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
export function buildResearchSubagent(callbacks?: BaseCallbackHandler[]): SubagentDef {
  return {
    name: 'research-subagent',
    description: 'Delegate focused internet-research tasks (web search + page crawling) to this sub-agent for content that does NOT need to be real-time — blogs, articles, tutorials, documentation, past events/history. Give it a specific, self-contained question or data-gathering task. It returns a concise text/JSON summary of findings; it does not modify shared state. Do NOT use this for live/real-time facts or breaking/latest/today\'s news (scores, prices, weather, AQI, headlines) — use `live-data-subagent` for those instead.',
    systemPrompt: `You are a focused research assistant for non-time-sensitive content. Today's date is ${new Date().toISOString().slice(0, 10)} — if a page's publish date is far from today and the task implies recency, flag it as potentially stale rather than presenting it as current. Use tavily_search and tavily_crawl to gather the requested information as efficiently as possible, then return a concise, well-structured summary (prefer JSON when the parent task requests structured data). Do not speculate beyond what the tools return.`,
    tools: [createTavilySearchTool(), createTavilyCrawlTool()],
    model: new FreeTierChatModel({ callbacks }),
  };
}

/**
 * For UI/screenshot analysis and for data extraction off rendered
 * pages (JS-heavy pages, dashboards, charts).
 */
export function buildVisionSubagent(callbacks?: BaseCallbackHandler[]): SubagentDef {
  return {
    name: 'vision-subagent',
    description: 'Delegate screenshot/vision-based tasks to this sub-agent: `vision_scrape` for extracting specific data values off a rendered page (e.g. dashboards, charts, JS-rendered pages that plain-text crawling cannot parse), and `analyze_page_components` for describing a page/screenshot\'s UI/layout. Give it a URL and a precise instruction. It returns the extracted text/JSON; it does not modify shared state.',
    systemPrompt: `You are a vision-extraction assistant. Today's date is ${new Date().toISOString().slice(0, 10)}. Use vision_scrape when the task needs specific data values read off a rendered page, and analyze_page_components when the task needs a description of the page/screenshot's UI or layout. Follow any output-format instructions (e.g. minified JSON) precisely. Return only the requested result.`,
    tools: [createVisionScrapeTool(), createPageAnalysisTool()],
    model: new FreeTierChatModel({ callbacks }),
  };
}

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
export function buildLiveDataSubagent(callbacks?: BaseCallbackHandler[]): SubagentDef {
  return {
    name: 'live-data-subagent',
    description: 'Delegate real-time/live-data lookups OR breaking/latest/today\'s news of ANY topic to this sub-agent — current stock/share prices, live match scores, current weather/AQI, today\'s headlines, or any fact that changes minute-to-minute. It finds the freshest authoritative URL(s) via recency-biased search, then reads/confirms the CURRENT content directly off the live rendered page(s) (bypassing any stale search-index cache). Give it a specific real-time or "today" question — for "top N stories" tasks, ask for exactly N. It returns the extracted value(s) as concise text/JSON; it does not modify shared state. Do NOT use this for stable content like blogs/tutorials/history — use `research-subagent` for those (cheaper and sufficient).',
    systemPrompt: `You answer real-time/live-data questions and breaking/latest/today's news questions only. Today's date is ${new Date().toISOString().slice(0, 10)}.
Step 1: call tavily_search with topic='news' and days=1 (or a larger window only if the task explicitly asks for "this week"/"this month") to find the freshest, most authoritative URL(s) — e.g. an official live-score page, an exchange/ticker page, a weather station page, or top news article pages. For "top N" tasks, gather N distinct candidate URLs.
Step 2: for each candidate URL, use vision_scrape with a precise prompt asking for the current value/headline plus its visible publish date/timestamp, as minified JSON. Never answer from the tavily_search snippet alone — it may be a stale cached copy.
Step 3: discard/replace any candidate whose confirmed publish date does not satisfy the requested recency window (e.g. not today, when "today" was asked for).
Return only the final confirmed value(s)/summary, never unverified search snippets.`,
    tools: [createTavilySearchTool(), createVisionScrapeTool()],
    model: new FreeTierChatModel({ callbacks }),
  };
}

/**
 * Default first-class sub-agents. Callers embedding this framework can
 * merge their own additional `SubagentDef`s with these (see
 * `DeepAgentRunner`'s `extraSubagents` option) rather than being
 * limited to only what's built in here.
 */
export function buildDefaultSubagents(callbacks?: BaseCallbackHandler[]): SubagentDef[] {
  return [buildResearchSubagent(callbacks), buildVisionSubagent(callbacks), buildLiveDataSubagent(callbacks)];
}
