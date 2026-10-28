/**
 * Deterministic, no-real-network checks that `tavily_search` forwards
 * the recency params (`topic`, `days`) correctly to the Tavily API
 * payload and rotates keys on rate limit/quota exhaustion. Mocks `global.fetch`
 * so this runs instantly without an API key or network access.
 */
import {
  createTavilySearchTool,
  resetTavilyKeyIndex,
  isTavilyQuotaOrRateLimitError,
} from '../src/tools/tavilyTools.js';
import type { CheckResult } from './providerSwapChecks.js';

export async function runToolPayloadChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const originalFetch = global.fetch;
  let capturedBody: Record<string, unknown> | null | undefined = null;

  try {
    // ----------------------------------------------------
    // Existing recency param checks
    // ----------------------------------------------------
    global.fetch = (async (_url: string, init?: RequestInit) => {
      capturedBody = init?.body ? JSON.parse(init.body as string) : null;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ results: [] }),
      } as unknown as Response;
    }) as typeof fetch;

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

    // ----------------------------------------------------
    // Key rotation checks
    // ----------------------------------------------------

    // Case 3: Key rotates on 429 to next key and succeeds
    {
      resetTavilyKeyIndex(0);
      const testKeys = ['mock-key-1', 'mock-key-2'];
      const rotatingTool = createTavilySearchTool(testKeys);
      const keysUsed: string[] = [];

      global.fetch = (async (_url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        keysUsed.push(body.api_key);
        if (body.api_key === 'mock-key-1') {
          return {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            text: async () => 'Rate limit exceeded',
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ results: [{ title: 'Found with key 2' }] }),
        } as unknown as Response;
      }) as typeof fetch;

      const rawResult = await rotatingTool.func({ query: 'rotate on 429 test' } as any);
      const parsed = JSON.parse(rawResult);
      const pass3 =
        keysUsed.length === 2 &&
        keysUsed[0] === 'mock-key-1' &&
        keysUsed[1] === 'mock-key-2' &&
        parsed.results?.[0]?.title === 'Found with key 2';

      results.push({
        id: 'tavily-search-rotates-key-on-429',
        pass: pass3,
        detail: pass3
          ? 'Rotated from rate-limited key-1 (429) to key-2 and succeeded.'
          : `Expected keys ['mock-key-1', 'mock-key-2'], got ${JSON.stringify(keysUsed)}`,
      });
    }

    // Case 4: Key rotates on quota/limit reached error body (e.g. 400 with 'Usage limit reached')
    {
      resetTavilyKeyIndex(0);
      const testKeys = ['quota-key-1', 'quota-key-2'];
      const rotatingTool = createTavilySearchTool(testKeys);
      const keysUsed: string[] = [];

      global.fetch = (async (_url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        keysUsed.push(body.api_key);
        if (body.api_key === 'quota-key-1') {
          return {
            ok: false,
            status: 400,
            statusText: 'Bad Request',
            text: async () => '{"detail": "Usage limit reached for current plan"}',
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ results: [{ title: 'Success after quota rotation' }] }),
        } as unknown as Response;
      }) as typeof fetch;

      const rawResult = await rotatingTool.func({ query: 'quota test' } as any);
      const parsed = JSON.parse(rawResult);
      const pass4 =
        keysUsed.length === 2 &&
        keysUsed[0] === 'quota-key-1' &&
        keysUsed[1] === 'quota-key-2' &&
        parsed.results?.[0]?.title === 'Success after quota rotation';

      results.push({
        id: 'tavily-search-rotates-key-on-quota-exhausted-text',
        pass: pass4,
        detail: pass4
          ? 'Rotated from quota-exhausted key-1 (limit reached message) to key-2 and succeeded.'
          : `Expected keys ['quota-key-1', 'quota-key-2'], got ${JSON.stringify(keysUsed)}`,
      });
    }

    // Case 5: Fails tool call only once ALL configured keys are exhausted
    {
      resetTavilyKeyIndex(0);
      const testKeys = ['exhaust-1', 'exhaust-2', 'exhaust-3'];
      const rotatingTool = createTavilySearchTool(testKeys);
      const keysUsed: string[] = [];

      global.fetch = (async (_url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        keysUsed.push(body.api_key);
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: async () => 'Quota exhausted',
        } as unknown as Response;
      }) as typeof fetch;

      let threw = false;
      let errorMessage = '';
      try {
        await rotatingTool.func({ query: 'exhaust all test' } as any);
      } catch (err) {
        threw = true;
        errorMessage = err instanceof Error ? err.message : String(err);
      }

      const pass5 =
        threw &&
        keysUsed.length === 3 &&
        keysUsed[0] === 'exhaust-1' &&
        keysUsed[1] === 'exhaust-2' &&
        keysUsed[2] === 'exhaust-3' &&
        /exhausted/i.test(errorMessage);

      results.push({
        id: 'tavily-search-fails-only-once-all-keys-exhausted',
        pass: pass5,
        detail: pass5
          ? 'Tried all 3 keys before failing the tool call with exhausted error.'
          : `Expected 3 keys tried and error thrown, got keys=${JSON.stringify(keysUsed)}, threw=${threw}, msg=${errorMessage}`,
      });
    }

    // Case 6: Fails immediately on non-quota client error (e.g. 400 Bad Request) without rotating
    {
      resetTavilyKeyIndex(0);
      const testKeys = ['valid-key-1', 'valid-key-2'];
      const rotatingTool = createTavilySearchTool(testKeys);
      const keysUsed: string[] = [];

      global.fetch = (async (_url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        keysUsed.push(body.api_key);
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: async () => 'Invalid parameter query',
        } as unknown as Response;
      }) as typeof fetch;

      let threw = false;
      try {
        await rotatingTool.func({ query: 'non-quota error test' } as any);
      } catch {
        threw = true;
      }

      const pass6 = threw && keysUsed.length === 1 && keysUsed[0] === 'valid-key-1';
      results.push({
        id: 'tavily-search-fails-immediately-on-non-quota-error',
        pass: pass6,
        detail: pass6
          ? 'Failed immediately on non-quota error without wasting subsequent keys.'
          : `Expected 1 key tried on non-quota error, got keys=${JSON.stringify(keysUsed)}`,
      });
    }
  } finally {
    global.fetch = originalFetch;
    resetTavilyKeyIndex(0);
  }

  return results;
}
