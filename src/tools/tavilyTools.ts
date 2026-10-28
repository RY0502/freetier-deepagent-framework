import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { CONFIG } from '../config.js';

export class TavilyHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly bodyText: string;

  constructor(status: number, statusText: string, bodyText: string) {
    super(`Tavily HTTP error ${status} ${statusText}: ${bodyText}`.trim());
    this.name = 'TavilyHttpError';
    this.status = status;
    this.statusText = statusText;
    this.bodyText = bodyText;
  }
}

const QUOTA_OR_RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /429/,
  /too many requests/i,
  /quota/i,
  /limit.*reach/i,
  /limit.*exceed/i,
  /exceeded.*limit/i,
  /usage.*limit/i,
  /plan.*limit/i,
  /credit.*exhaust/i,
  /out of credits/i,
  /insufficient.*credit/i,
  /insufficient.*quota/i,
  /exhausted/i,
];

/**
 * Checks if an error corresponds to rate limiting, HTTP 429, or quota/credit limit exhaustion.
 */
export function isTavilyQuotaOrRateLimitError(error: unknown): boolean {
  if (!error) return false;

  if (error instanceof TavilyHttpError) {
    if (error.status === 429 || error.status === 402) {
      return true;
    }
    const combined = `${error.statusText} ${error.bodyText}`;
    return QUOTA_OR_RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(combined));
  }

  const status = (error as { status?: number; statusCode?: number })?.status
    ?? (error as { status?: number; statusCode?: number })?.statusCode;
  if (status === 429 || status === 402) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return QUOTA_OR_RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message));
}

let activeTavilyKeyIndex = 0;

export function getActiveTavilyKeyIndex(): number {
  return activeTavilyKeyIndex;
}

export function resetTavilyKeyIndex(index = 0): void {
  activeTavilyKeyIndex = index;
}

/**
 * Collects all configured Tavily API keys in rotation order.
 * Supports comma/space-separated TAVILY_API_KEY as well as numbered
 * TAVILY_API_KEY_1..N variables.
 */
export function getTavilyApiKeys(customKeys?: string[]): string[] {
  if (customKeys && customKeys.length > 0) {
    return customKeys.map((k) => k.trim()).filter(Boolean);
  }

  const rawKeys: string[] = [];

  // Check main TAVILY_API_KEY (supports comma, semicolon, whitespace separation)
  if (CONFIG.TAVILY_API_KEY) {
    const split = CONFIG.TAVILY_API_KEY.split(/[,\s;]+/).map((k) => k.trim()).filter(Boolean);
    rawKeys.push(...split);
  }

  // Check numbered keys TAVILY_API_KEY_1..5 from CONFIG
  const numberedConfig = [
    CONFIG.TAVILY_API_KEY_1,
    CONFIG.TAVILY_API_KEY_2,
    CONFIG.TAVILY_API_KEY_3,
    CONFIG.TAVILY_API_KEY_4,
    CONFIG.TAVILY_API_KEY_5,
  ].filter(Boolean);
  rawKeys.push(...numberedConfig);

  // Check any TAVILY_API_KEY_* in process.env
  for (const [key, val] of Object.entries(process.env)) {
    if (/^TAVILY_API_KEY_\d+$/i.test(key) && val) {
      const trimmed = val.trim();
      if (trimmed) rawKeys.push(trimmed);
    }
  }

  // Deduplicate while preserving rotation order
  const uniqueKeys: string[] = [];
  for (const k of rawKeys) {
    if (!uniqueKeys.includes(k)) {
      uniqueKeys.push(k);
    }
  }

  return uniqueKeys;
}

function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '***';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Executes a Tavily request function with key rotation on rate limits / 429 / quota exhaustion.
 * Only fails once all configured keys have been tried and exhausted.
 */
export async function executeTavilyWithKeyRotation<T>(
  operationName: string,
  requestFn: (apiKey: string) => Promise<T>,
  customKeys?: string[]
): Promise<T> {
  const keys = getTavilyApiKeys(customKeys);
  if (keys.length === 0) {
    throw new Error(
      `Tavily ${operationName} error: No Tavily API keys configured. Set TAVILY_API_KEY or TAVILY_API_KEY_1..N in your environment.`
    );
  }

  const startIndex = activeTavilyKeyIndex % keys.length;
  let lastError: unknown;

  for (let attempt = 0; attempt < keys.length; attempt++) {
    const currentIndex = (startIndex + attempt) % keys.length;
    const currentKey = keys[currentIndex];

    try {
      const result = await requestFn(currentKey);
      // Success: retain this working key as the active key
      activeTavilyKeyIndex = currentIndex;
      return result;
    } catch (err) {
      if (isTavilyQuotaOrRateLimitError(err)) {
        lastError = err;
        console.warn(
          `[${operationName}] Tavily key index ${currentIndex} (${maskApiKey(currentKey)}) hit rate limit / 429 / quota exhaustion. Rotating to next key...`
        );
        // Advance pointer to next key
        activeTavilyKeyIndex = (currentIndex + 1) % keys.length;
        continue;
      }

      // Non-quota error (e.g. invalid query or client error): fail immediately
      throw err;
    }
  }

  // All configured keys have been tried and exhausted
  const errDetail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `Tavily ${operationName} error: all configured keys (${keys.length}) exhausted due to rate limit/quota. Last error: ${errDetail}`
  );
}

/**
 * Tavily search tool — general internet search for the deep agent.
 * Automatically rotates across configured keys when a key hits rate limits (429) or quota exhaustion.
 */
export function createTavilySearchTool(customApiKeys?: string[]): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'tavily_search',
    description: "Search the internet for information on a topic using Tavily. Automatically rotates across configured Tavily API keys on rate limits (429) or quota exhaustion. Returns a list of relevant results with titles, URLs, and content snippets. NOTE: Tavily's index can return cached/stale snapshots of pages, so this is well-suited to content that does not change minute-to-minute (blogs, articles, tutorials, documentation, past events/history). For fast-changing real-time facts OR breaking/latest/today's news (live scores, stock prices, current weather, AQI, today's headlines, etc.) set `topic: 'news'` and `days` to bias results toward recent content, and use this tool only to find the right URL — then read/confirm the live value with `vision_scrape` on that URL rather than trusting the snippet here.",
    schema: z.object({
      query: z.string().describe('The search query'),
      maxResults: z.number().int().min(1).max(10).optional().describe('Max number of results (default 5)'),
      topic: z.enum(['general', 'news']).optional().describe("Set to 'news' when the task asks for breaking/latest/today's news or any fast-changing current-events topic, so Tavily biases results toward recent publish dates (default 'general')."),
      days: z.number().int().min(1).max(365).optional().describe("Only return results published within this many days. Use with topic='news' for 'today' (days=1) or 'this week' (days=7) style queries. Ignored when topic='general'."),
    }),
    func: async ({ query, maxResults, topic, days }: { query: string; maxResults?: number; topic?: 'general' | 'news'; days?: number }) => {
      return executeTavilyWithKeyRotation('search', async (apiKey) => {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: maxResults ?? 5,
            topic: topic ?? 'general',
            ...(topic === 'news' && days ? { days } : {}),
          }),
        });
        if (!response.ok) {
          const bodyText = await response.text().catch(() => '');
          throw new TavilyHttpError(response.status, response.statusText, bodyText);
        }
        const data = await response.json();
        return JSON.stringify(data);
      }, customApiKeys);
    },
  });
}

/**
 * Tavily extract/crawl tool — fetches raw page content + links for a
 * specific URL (used to follow up on search results).
 * Automatically rotates across configured keys on rate limit/quota exhaustion.
 */
export function createTavilyCrawlTool(customApiKeys?: string[]): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'tavily_crawl',
    description: "Crawl a specific webpage URL and extract its raw text content and outgoing links using Tavily. Like `tavily_search`, this can return a cached/stale copy of the page — fine for blogs/articles/tutorials/history, but do NOT rely on it for real-time values or breaking/latest/today's news (scores, prices, weather, AQI, headlines); use `vision_scrape` on the URL for those instead.",
    schema: z.object({
      url: z.string().describe('The URL to crawl'),
    }),
    func: async ({ url }: { url: string }) => {
      return executeTavilyWithKeyRotation('crawl', async (apiKey) => {
        const response = await fetch('https://api.tavily.com/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            urls: [url],
            include_links: true,
          }),
        });
        if (!response.ok) {
          const bodyText = await response.text().catch(() => '');
          throw new TavilyHttpError(response.status, response.statusText, bodyText);
        }
        const data = await response.json();
        return JSON.stringify(data);
      }, customApiKeys);
    },
  });
}
