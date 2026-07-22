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
export function classifyProviderError(error) {
    const status = error?.status
        ?? error?.statusCode;
    const message = error instanceof Error ? error.message : String(error);
    if (status === 429)
        return 'quota';
    if (QUOTA_PATTERNS.some((re) => re.test(message)))
        return 'quota';
    if (status !== undefined && status >= 500)
        return 'retryable';
    if (RETRYABLE_PATTERNS.some((re) => re.test(message)))
        return 'retryable';
    return 'fatal';
}
//# sourceMappingURL=errorClassifier.js.map