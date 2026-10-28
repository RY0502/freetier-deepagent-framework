import { DynamicStructuredTool } from '@langchain/core/tools';
export declare class TavilyHttpError extends Error {
    readonly status: number;
    readonly statusText: string;
    readonly bodyText: string;
    constructor(status: number, statusText: string, bodyText: string);
}
/**
 * Checks if an error corresponds to rate limiting, HTTP 429, or quota/credit limit exhaustion.
 */
export declare function isTavilyQuotaOrRateLimitError(error: unknown): boolean;
export declare function getActiveTavilyKeyIndex(): number;
export declare function resetTavilyKeyIndex(index?: number): void;
/**
 * Collects all configured Tavily API keys in rotation order.
 * Supports comma/space-separated TAVILY_API_KEY as well as numbered
 * TAVILY_API_KEY_1..N variables.
 */
export declare function getTavilyApiKeys(customKeys?: string[]): string[];
/**
 * Executes a Tavily request function with key rotation on rate limits / 429 / quota exhaustion.
 * Only fails once all configured keys have been tried and exhausted.
 */
export declare function executeTavilyWithKeyRotation<T>(operationName: string, requestFn: (apiKey: string) => Promise<T>, customKeys?: string[]): Promise<T>;
/**
 * Tavily search tool — general internet search for the deep agent.
 * Automatically rotates across configured keys when a key hits rate limits (429) or quota exhaustion.
 */
export declare function createTavilySearchTool(customApiKeys?: string[]): DynamicStructuredTool;
/**
 * Tavily extract/crawl tool — fetches raw page content + links for a
 * specific URL (used to follow up on search results).
 * Automatically rotates across configured keys on rate limit/quota exhaustion.
 */
export declare function createTavilyCrawlTool(customApiKeys?: string[]): DynamicStructuredTool;
