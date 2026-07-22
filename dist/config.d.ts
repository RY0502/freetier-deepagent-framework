import 'dotenv/config';
/**
 * Centralized, validated runtime configuration.
 * Fails fast on startup if required env vars are missing.
 */
export declare const CONFIG: {
    NVIDIA_API_KEY: string;
    OPENROUTER_API_KEY: string;
    HUGGINGFACE_API_KEY: string;
    NVIDIA_DEEP_AGENT_MODEL: string;
    OPENROUTER_DEEP_AGENT_MODEL: string;
    HUGGINGFACE_DEEP_AGENT_MODEL: string;
    NVIDIA_BASE_URL: string;
    OPENROUTER_BASE_URL: string;
    HUGGINGFACE_BASE_URL: string;
    TAVILY_API_KEY: string;
    NEON_DATABASE_URL: string;
    SCRAPE_AGENT_URL: string;
    MAX_PARALLEL_SUBAGENTS: number;
    PROVIDER_RETRY_MAX: number;
    PROVIDER_RETRY_DELAY_MS: number;
    PROVIDER_COOLDOWN_MS: number;
};
export declare function validateConfig(): void;
