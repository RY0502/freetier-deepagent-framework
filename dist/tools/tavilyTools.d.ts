import { DynamicStructuredTool } from '@langchain/core/tools';
/**
 * Tavily search tool — general internet search for the deep agent.
 */
export declare function createTavilySearchTool(): DynamicStructuredTool;
/**
 * Tavily extract/crawl tool — fetches raw page content + links for a
 * specific URL (used to follow up on search results).
 */
export declare function createTavilyCrawlTool(): DynamicStructuredTool;
