/**
 * Classifies an error thrown by a provider's chat model call as a quota/
 * rate-limit exhaustion (triggers immediate provider switch) versus a
 * transient error (safe to retry on the same provider) versus a fatal,
 * non-recoverable error (bubble up).
 *
 * Mirrors the classification approach used by `@freetier/orchestrator`'s
 * ErrorKind, applied here to the main deep agent's own LLM provider.
 */
export type ErrorKind = 'quota' | 'retryable' | 'fatal';

const QUOTA_PATTERNS = [
  /rate.?limit/i,
  /quota/i,
  /429/,
  /too many requests/i,
  /insufficient_quota/i,
  /exceeded.*limit/i,
  /credit.*exhaust/i,
];

const RETRYABLE_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /econnreset/i,
  /econnrefused/i,
  /network/i,
  /5\d\d/, // 5xx server errors
  /model.*(busy|overloaded|unavailable)/i,
  /service unavailable/i,
];

export function classifyProviderError(error: unknown): ErrorKind {
  const status = (error as { status?: number; statusCode?: number })?.status
    ?? (error as { status?: number; statusCode?: number })?.statusCode;
  const message = error instanceof Error ? error.message : String(error);

  if (status === 429) return 'quota';
  if (QUOTA_PATTERNS.some((re) => re.test(message))) return 'quota';

  if (status !== undefined && status >= 500) return 'retryable';
  if (RETRYABLE_PATTERNS.some((re) => re.test(message))) return 'retryable';

  return 'fatal';
}
