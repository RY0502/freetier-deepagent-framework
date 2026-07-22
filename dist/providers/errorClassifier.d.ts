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
export declare function classifyProviderError(error: unknown): ErrorKind;
