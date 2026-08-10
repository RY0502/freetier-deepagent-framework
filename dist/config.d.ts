import 'dotenv/config';
/**
 * Centralized, validated runtime configuration.
 * Fails fast on startup if required env vars are missing.
 */
export declare const CONFIG: {
    ANYAPI_AGENT_KEY_1: string;
    ANYAPI_AGENT_KEY_2: string;
    ANYAPI_AGENT_KEY_3: string;
    ANYAPI_AGENT_KEY_4: string;
    REQUESTY_API_KEY: string;
    NVIDIA_DEEP_AGENT_API_KEY_1: string;
    NVIDIA_DEEP_AGENT_API_KEY_2: string;
    NVIDIA_DEEP_AGENT_API_KEY_3: string;
    NVIDIA_DEEP_AGENT_API_KEY_4: string;
    OPENROUTER_API_KEY: string;
    HUGGINGFACE_API_KEY: string;
    ANYAPI_DEEP_AGENT_MODEL: string;
    NVIDIA_DEEP_AGENT_MODEL: string;
    REQUESTY_DEEP_AGENT_MODEL: string;
    OPENROUTER_DEEP_AGENT_MODEL: string;
    HUGGINGFACE_DEEP_AGENT_MODEL: string;
    ANYAPI_BASE_URL: string;
    NVIDIA_BASE_URL: string;
    REQUESTY_BASE_URL: string;
    OPENROUTER_BASE_URL: string;
    HUGGINGFACE_BASE_URL: string;
    TAVILY_API_KEY: string;
    NEON_DATABASE_URL: string;
    SCRAPE_AGENT_URL: string;
    CLOUDFLARE_IMG2IMG_ACCOUNT_ID_1: string;
    CLOUDFLARE_IMG2IMG_API_TOKEN_1: string;
    CLOUDFLARE_IMG2IMG_ACCOUNT_ID_2: string;
    CLOUDFLARE_IMG2IMG_API_TOKEN_2: string;
    CLOUDFLARE_IMG2IMG_ACCOUNT_ID_3: string;
    CLOUDFLARE_IMG2IMG_API_TOKEN_3: string;
    MAX_PARALLEL_SUBAGENTS: number;
    PROVIDER_RETRY_MAX: number;
    PROVIDER_RETRY_DELAY_MS: number;
    PROVIDER_COOLDOWN_MS: number;
};
export declare function validateConfig(): void;
