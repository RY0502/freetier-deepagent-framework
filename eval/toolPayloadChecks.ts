/**
 * Deterministic, no-real-network checks that `tavily_search` forwards
 * the recency params (`topic`, `days`) correctly to the Tavily API
 * payload. Mocks `global.fetch` so this runs instantly without an API
 * key or network access.
 */
import { createTavilySearchTool } from '../src/tools/tavilyTools.js';
import type { CheckResult } from './providerSwapChecks.js';

export async function runToolPayloadChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const originalFetch = global.fetch;
  let capturedBody: Record<string, unknown> | null | undefined = null;

  global.fetch = (async (_url: string, init?: RequestInit) => {
    capturedBody = init?.body ? JSON.parse(init.body as string) : null;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ results: [] }),
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const tool = createTavilySearchTool();

    // Case 1: news + days should be forwarded as-is.
    await tool.func({ query: 'AI news today', topic: 'news', days: 1 } as any);
    const body1 = capturedBody as Record<string, unknown> | null;
    const pass1 = body1?.topic === 'news' && body1?.days === 1;
    results.push({
      id: 'tavily-search-forwards-news-recency-params',
      pass: pass1,
      detail: pass1
        ? "topic:'news' and days:1 correctly forwarded to Tavily payload."
        : `Expected topic:'news', days:1 in payload, got ${JSON.stringify(capturedBody)}`,
    });

    // Case 2: default (no topic/days) should default to 'general' and omit days.
    capturedBody = null;
    await tool.func({ query: 'history of transformers' } as any);
    const body2 = capturedBody as Record<string, unknown> | null;
    const pass2 = body2?.topic === 'general' && !('days' in (body2 ?? {}));
    results.push({
      id: 'tavily-search-defaults-to-general',
      pass: pass2,
      detail: pass2
        ? "Default query correctly used topic:'general' with no 'days' param."
        : `Expected topic:'general' and no 'days' key, got ${JSON.stringify(capturedBody)}`,
    });
  } finally {
    global.fetch = originalFetch;
  }

  return results;
}
