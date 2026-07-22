import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { CONFIG } from '../config.js';

/**
 * Shared caller for the remote scrape-agent service
 * (https://github.com/RY0502/scrape-agent). The service navigates to
 * the given URL, takes a screenshot, and asks a vision-language model
 * (via its own internal @freetier/orchestrator rotation) to answer the
 * given prompt about that screenshot — so this framework does not need
 * to manage vision-provider quotas itself.
 */
async function callScrapeAgent(url: string, prompt: string): Promise<string> {
  const response = await fetch(`${CONFIG.SCRAPE_AGENT_URL}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, prompt }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`scrape-agent error: ${response.status} ${response.statusText} ${text}`);
  }
  return await response.text();
}

/**
 * Data-extraction tool: use this when you need specific facts/values
 * (text, numbers, JSON fields) read off a rendered page — e.g. a live
 * score, a price, or a JS-rendered chart's data points. Pair this with
 * `tavily_search` when the URL isn't already known (search first to
 * find the freshest source, then scrape it here for the current value).
 */
export function createVisionScrapeTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'vision_scrape',
    description: "Visit a URL, take a screenshot, and use a vision-language model to extract specific DATA (facts, numbers, text, JSON fields) from the rendered page — useful for JS-heavy pages, live dashboards, or charts that plain text extraction cannot handle. Best for time-sensitive values (scores, prices, readings) read directly off the page, since it renders and reads the page fresh rather than relying on a cached index. Provide a precise extraction prompt describing exactly what data to return, ideally as minified JSON. Use `analyze_page_components` instead if you need a description of the page's layout/UI rather than data values.",
    schema: z.object({
      url: z.string().describe('The URL to visit and screenshot'),
      prompt: z.string().describe('Precise instructions describing what data to extract from the screenshot, e.g. requesting a specific minified JSON shape'),
    }),
    func: async ({ url, prompt }: { url: string; prompt: string }) => callScrapeAgent(url, prompt),
  });
}

/**
 * Layout/component-analysis tool: use this when the task is about the
 * page's UI/structure itself (e.g. "what components are on this
 * screen", "describe this dashboard's layout", "critique this design")
 * rather than about extracting a data value. Backed by the same
 * scrape-agent screenshot pipeline, but kept as a separate tool with a
 * distinct name/description so the deep agent doesn't confuse "give me
 * the data on this page" with "describe this page's UI".
 */
export function createPageAnalysisTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'analyze_page_components',
    description: 'Visit a URL (or screenshot-able page), take a screenshot, and use a vision-language model to describe/analyze its UI — layout, components, visual structure, accessibility/design observations. Use this for "what is on this page/screenshot" or design-review style questions. Use `vision_scrape` instead if you need actual data values extracted from the page.',
    schema: z.object({
      url: z.string().describe('The URL to visit and screenshot'),
      prompt: z.string().describe('What aspect of the page/UI to analyze, e.g. "list all interactive components and their approximate positions"'),
    }),
    func: async ({ url, prompt }: { url: string; prompt: string }) => callScrapeAgent(url, prompt),
  });
}
