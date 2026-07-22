/**
 * Deterministic, no-API-call checks for the provider-rotation logic
 * (`ProviderManager`, `classifyProviderError`). These validate the
 * "model swapped" behavior — that a quota/rate-limit error correctly
 * advances to the next provider in `PROVIDER_ORDER`, that the manager
 * exhausts cleanly, and that non-quota errors are classified
 * differently (so they do NOT trigger a pointless provider swap).
 */
import { ProviderManager, PROVIDER_ORDER } from '../src/providers/providerManager.js';
import { classifyProviderError } from '../src/providers/errorClassifier.js';

export interface CheckResult {
  id: string;
  pass: boolean;
  detail: string;
}

export function runProviderSwapChecks(): CheckResult[] {
  const results: CheckResult[] = [];

  // 1. Rotation order matches PROVIDER_ORDER and wraps to null after the last provider.
  {
    const pm = new ProviderManager(PROVIDER_ORDER[0]);
    const seen: string[] = [pm.current];
    for (let i = 1; i < PROVIDER_ORDER.length; i++) {
      const next = pm.switchToNext();
      seen.push(next ?? 'null');
    }
    const exhausted = pm.switchToNext();
    const pass = JSON.stringify(seen) === JSON.stringify(PROVIDER_ORDER) && exhausted === null;
    results.push({
      id: 'provider-rotation-order',
      pass,
      detail: pass
        ? `Rotated through ${PROVIDER_ORDER.join(' -> ')} then exhausted as expected.`
        : `Expected rotation ${PROVIDER_ORDER.join(' -> ')}, got ${seen.join(' -> ')}; exhausted=${exhausted}`,
    });
  }

  // 2. Starting mid-list (simulating a resumed run) picks up from the persisted provider.
  {
    const startFrom = PROVIDER_ORDER[Math.min(1, PROVIDER_ORDER.length - 1)];
    const pm = new ProviderManager(startFrom);
    const pass = pm.current === startFrom;
    results.push({
      id: 'provider-resume-from-persisted',
      pass,
      detail: pass
        ? `Resumed correctly at persisted provider '${startFrom}'.`
        : `Expected to resume at '${startFrom}', got '${pm.current}'.`,
    });
  }

  // 3. Quota-style errors classify as 'quota' (should trigger a swap).
  {
    const quotaErrors = [
      new Error('Rate limit exceeded, please retry later'),
      Object.assign(new Error('Too Many Requests'), { status: 429 }),
      new Error('insufficient_quota: you have exceeded your current quota'),
    ];
    const allQuota = quotaErrors.every((e) => classifyProviderError(e) === 'quota');
    results.push({
      id: 'error-classify-quota',
      pass: allQuota,
      detail: allQuota
        ? 'All quota/rate-limit style errors classified as "quota".'
        : `Some quota-style errors were NOT classified as "quota": ${quotaErrors.map((e) => `${e.message} -> ${classifyProviderError(e)}`).join('; ')}`,
    });
  }

  // 4. Non-quota errors (e.g. bad request / auth) should NOT trigger a swap.
  {
    const fatalError = new Error('invalid_api_key: The provided API key is invalid');
    const kind = classifyProviderError(fatalError);
    const pass = kind === 'fatal';
    results.push({
      id: 'error-classify-fatal-not-swapped',
      pass,
      detail: pass
        ? 'Auth/config errors correctly classified as "fatal" (no wasted provider swap).'
        : `Expected 'fatal', got '${kind}' for an invalid-api-key error.`,
    });
  }

  // 5. Transient network/5xx errors should be retryable on the SAME provider, not swapped.
  {
    const transient = Object.assign(new Error('Service temporarily unavailable'), { status: 503 });
    const kind = classifyProviderError(transient);
    const pass = kind === 'retryable';
    results.push({
      id: 'error-classify-retryable-same-provider',
      pass,
      detail: pass
        ? '5xx/transient errors correctly classified as "retryable" (retry same provider before swapping).'
        : `Expected 'retryable', got '${kind}' for a 503 error.`,
    });
  }

  return results;
}
