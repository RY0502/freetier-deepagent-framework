import { DynamicStructuredTool } from '@langchain/core/tools';
/**
 * Data-extraction tool: use this when you need specific facts/values
 * (text, numbers, JSON fields) read off a rendered page — e.g. a live
 * score, a price, or a JS-rendered chart's data points. Pair this with
 * `tavily_search` when the URL isn't already known (search first to
 * find the freshest source, then scrape it here for the current value).
 */
export declare function createVisionScrapeTool(): DynamicStructuredTool;
/**
 * Layout/component-analysis tool: use this when the task is about the
 * page's UI/structure itself (e.g. "what components are on this
 * screen", "describe this dashboard's layout", "critique this design")
 * rather than about extracting a data value. Backed by the same
 * scrape-agent screenshot pipeline, but kept as a separate tool with a
 * distinct name/description so the deep agent doesn't confuse "give me
 * the data on this page" with "describe this page's UI".
 */
export declare function createPageAnalysisTool(): DynamicStructuredTool;
