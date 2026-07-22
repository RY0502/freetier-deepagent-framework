import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { CONFIG } from '../config.js';
/**
 * Tavily search tool — general internet search for the deep agent.
 */
export function createTavilySearchTool() {
    return new DynamicStructuredTool({
        name: 'tavily_search',
        description: "Search the internet for information on a topic using Tavily. Returns a list of relevant results with titles, URLs, and content snippets. NOTE: Tavily's index can return cached/stale snapshots of pages, so this is well-suited to content that does not change minute-to-minute (blogs, articles, tutorials, documentation, past events/history). For fast-changing real-time facts OR breaking/latest/today's news (live scores, stock prices, current weather, AQI, today's headlines, etc.) set `topic: 'news'` and `days` to bias results toward recent content, and use this tool only to find the right URL — then read/confirm the live value with `vision_scrape` on that URL rather than trusting the snippet here.",
        schema: z.object({
            query: z.string().describe('The search query'),
            maxResults: z.number().int().min(1).max(10).optional().describe('Max number of results (default 5)'),
            topic: z.enum(['general', 'news']).optional().describe("Set to 'news' when the task asks for breaking/latest/today's news or any fast-changing current-events topic, so Tavily biases results toward recent publish dates (default 'general')."),
            days: z.number().int().min(1).max(365).optional().describe("Only return results published within this many days. Use with topic='news' for 'today' (days=1) or 'this week' (days=7) style queries. Ignored when topic='general'."),
        }),
        func: async ({ query, maxResults, topic, days }) => {
            const response = await fetch('https://api.tavily.com/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: CONFIG.TAVILY_API_KEY,
                    query,
                    max_results: maxResults ?? 5,
                    topic: topic ?? 'general',
                    ...(topic === 'news' && days ? { days } : {}),
                }),
            });
            if (!response.ok) {
                throw new Error(`Tavily search error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return JSON.stringify(data);
        },
    });
}
/**
 * Tavily extract/crawl tool — fetches raw page content + links for a
 * specific URL (used to follow up on search results).
 */
export function createTavilyCrawlTool() {
    return new DynamicStructuredTool({
        name: 'tavily_crawl',
        description: "Crawl a specific webpage URL and extract its raw text content and outgoing links using Tavily. Like `tavily_search`, this can return a cached/stale copy of the page — fine for blogs/articles/tutorials/history, but do NOT rely on it for real-time values or breaking/latest/today's news (scores, prices, weather, AQI, headlines); use `vision_scrape` on the URL for those instead.",
        schema: z.object({
            url: z.string().describe('The URL to crawl'),
        }),
        func: async ({ url }) => {
            const response = await fetch('https://api.tavily.com/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    api_key: CONFIG.TAVILY_API_KEY,
                    urls: [url],
                    include_links: true,
                }),
            });
            if (!response.ok) {
                throw new Error(`Tavily extract error: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            return JSON.stringify(data);
        },
    });
}
//# sourceMappingURL=tavilyTools.js.map