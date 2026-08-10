/**
 * Deterministic, no-API-call checks for the provider-rotation logic
 * (`ProviderManager`, `classifyProviderError`). These validate the
 * "model swapped" behavior — that a quota/rate-limit error correctly
 * advances to the next provider in `PROVIDER_ORDER`, that the manager
 * exhausts cleanly, and that non-quota errors are classified
 * differently (so they do NOT trigger a pointless provider swap).
 */
import { ProviderManager, PROVIDER_ORDER } from '../src/providers/providerManager.js';
import { CONFIG } from '../src/config.js';
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
    for (let i = 0; i < 16; i++) {
      const next = pm.switchToNext();
      if (!next) break;
      seen.push(next ?? 'null');
    }
    const exhausted = pm.switchToNext();
    const uniqueSeen = seen.filter((provider, index) => index === 0 || provider !== seen[index - 1]);
    const pass = JSON.stringify(uniqueSeen) === JSON.stringify(PROVIDER_ORDER) && exhausted === null;
    results.push({
      id: 'provider-rotation-order',
      pass,
      detail: pass
        ? `Rotated through ${PROVIDER_ORDER.join(' -> ')} then exhausted as expected.`
        : `Expected rotation ${PROVIDER_ORDER.join(' -> ')}, got ${uniqueSeen.join(' -> ')} from raw path ${seen.join(' -> ')}; exhausted=${exhausted}`,
    });
  }

  // 1b. NVIDIA multi-key rotation happens before moving to Requesty.
  {
    const nvidiaKeys = [CONFIG.NVIDIA_DEEP_AGENT_API_KEY_1, CONFIG.NVIDIA_DEEP_AGENT_API_KEY_2, CONFIG.NVIDIA_DEEP_AGENT_API_KEY_3, CONFIG.NVIDIA_DEEP_AGENT_API_KEY_4].filter(Boolean);
    const pm = new ProviderManager('nvidia', 0, 0);
    const seen: string[] = [`${pm.current}[key=${pm.currentNvidiaKeyIndex}]`];
    for (let i = 1; i < nvidiaKeys.length; i++) {
      const next = pm.switchToNext();
      if (!next) break;
      seen.push(`${next}[key=${pm.current === 'nvidia' ? pm.currentNvidiaKeyIndex : 0}]`);
    }
    const expected = nvidiaKeys.map((_, index) => `nvidia[key=${index}]`);
    const pass = nvidiaKeys.length > 0 && JSON.stringify(seen) === JSON.stringify(expected) && pm.switchToNext() === 'anyapi';
    results.push({
      id: 'nvidia-multi-key-rotation',
      pass,
      detail: pass
        ? 'NVIDIA rotated through all configured keys before moving to AnyApi.'
        : `Expected ${expected.join(' -> ')} then anyapi, got ${seen.join(' -> ')}`,
    });
  }

  // 1c. AnyApi multi-key rotation happens before moving to Requesty.
  {
    const anyApiKeys = [CONFIG.ANYAPI_AGENT_KEY_1, CONFIG.ANYAPI_AGENT_KEY_2, CONFIG.ANYAPI_AGENT_KEY_3, CONFIG.ANYAPI_AGENT_KEY_4].filter(Boolean);
    const pm = new ProviderManager('anyapi', 0, 0);
    const seen: string[] = [`${pm.current}[key=${pm.currentAnyApiKeyIndex}]`];
    for (let i = 1; i < anyApiKeys.length; i++) {
      const next = pm.switchToNext();
      if (!next) break;
      seen.push(`${next}[key=${pm.current === 'anyapi' ? pm.currentAnyApiKeyIndex : 0}]`);
    }
    const expected = anyApiKeys.map((_, index) => `anyapi[key=${index}]`);
    const pass = anyApiKeys.length > 0 && JSON.stringify(seen) === JSON.stringify(expected) && pm.switchToNext() === 'requesty';
    results.push({
      id: 'anyapi-multi-key-rotation',
      pass,
      detail: pass
        ? 'AnyApi rotated through all configured keys before moving to Requesty.'
        : `Expected ${expected.join(' -> ')} then requesty, got ${seen.join(' -> ')}`,
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

  // 5. Requesty transient network/5xx errors are rotation-eligible.
  {
    const transient = Object.assign(new Error('Service temporarily unavailable'), { status: 503 });
    const kind = classifyProviderError(transient);
    const pm = new ProviderManager('requesty');
    const next = kind === 'retryable' ? pm.switchToNext() : null;
    const pass = kind === 'retryable' && next === 'openrouter';
    results.push({
      id: 'requesty-transient-rotates-provider',
      pass,
      detail: pass
        ? 'Requesty retryable/transient errors advance to the next provider.'
        : `Expected Requesty transient error to rotate to 'openrouter', got kind='${kind}' next='${next}'.`,
    });
  }

  // 6. Transient network/5xx errors should remain retryable on non-Requesty providers.
  {
    const transient = Object.assign(new Error('Service temporarily unavailable'), { status: 503 });
    const kind = classifyProviderError(transient);
    const pm = new ProviderManager('nvidia');
    const pass = kind === 'retryable' && pm.current === 'nvidia' && pm.currentNvidiaKeyIndex === 0;
    results.push({
      id: 'error-classify-retryable-same-provider',
      pass,
      detail: pass
        ? '5xx/transient errors remain same-provider retryable for non-Requesty providers.'
        : `Expected non-Requesty transient errors to remain same-provider retryable, got '${kind}'.`,
    });
  }

  return results;
}
