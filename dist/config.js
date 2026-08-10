import 'dotenv/config';
/**
 * Centralized, validated runtime configuration.
 * Fails fast on startup if required env vars are missing.
 */
export const CONFIG = {
    ANYAPI_AGENT_KEY_1: process.env.ANYAPI_AGENT_KEY_1 ?? '',
    ANYAPI_AGENT_KEY_2: process.env.ANYAPI_AGENT_KEY_2 ?? '',
    ANYAPI_AGENT_KEY_3: process.env.ANYAPI_AGENT_KEY_3 ?? '',
    ANYAPI_AGENT_KEY_4: process.env.ANYAPI_AGENT_KEY_4 ?? '',
    REQUESTY_API_KEY: process.env.REQUESTY_API_KEY ?? '',
    NVIDIA_DEEP_AGENT_API_KEY_1: process.env.NVIDIA_DEEP_AGENT_API_KEY_1 ?? '',
    NVIDIA_DEEP_AGENT_API_KEY_2: process.env.NVIDIA_DEEP_AGENT_API_KEY_2 ?? '',
    NVIDIA_DEEP_AGENT_API_KEY_3: process.env.NVIDIA_DEEP_AGENT_API_KEY_3 ?? '',
    NVIDIA_DEEP_AGENT_API_KEY_4: process.env.NVIDIA_DEEP_AGENT_API_KEY_4 ?? '',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? '',
    HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY ?? '',
    ANYAPI_DEEP_AGENT_MODEL: process.env.ANYAPI_DEEP_AGENT_MODEL ?? 'openai/gpt-5.5',
    NVIDIA_DEEP_AGENT_MODEL: process.env.NVIDIA_DEEP_AGENT_MODEL ?? 'z-ai/glm-5.2',
    REQUESTY_DEEP_AGENT_MODEL: process.env.REQUESTY_DEEP_AGENT_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
    OPENROUTER_DEEP_AGENT_MODEL: process.env.OPENROUTER_DEEP_AGENT_MODEL ?? 'z-ai/glm-5.2',
    HUGGINGFACE_DEEP_AGENT_MODEL: process.env.HUGGINGFACE_DEEP_AGENT_MODEL ?? 'zai-org/GLM-5.2',
    ANYAPI_BASE_URL: process.env.ANYAPI_BASE_URL ?? 'https://api.anyapi.ai/v1',
    NVIDIA_BASE_URL: process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    REQUESTY_BASE_URL: process.env.REQUESTY_BASE_URL ?? 'https://router.requesty.ai/v1',
    OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    HUGGINGFACE_BASE_URL: process.env.HUGGINGFACE_BASE_URL ?? 'https://router.huggingface.co/v1',
    TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? '',
    NEON_DATABASE_URL: process.env.NEON_DATABASE_URL ?? '',
    SCRAPE_AGENT_URL: process.env.SCRAPE_AGENT_URL ?? 'https://scrape-agent.onrender.com',
    // Cloudflare Workers AI img2img tool (built-in `generate_image_cloudflare_img2img`
    // tool). Each rotating credential has its own account id and API token.
    CLOUDFLARE_IMG2IMG_ACCOUNT_ID_1: process.env.CLOUDFLARE_IMG2IMG_ACCOUNT_ID_1 ?? '',
    CLOUDFLARE_IMG2IMG_API_TOKEN_1: process.env.CLOUDFLARE_IMG2IMG_API_TOKEN_1 ?? '',
    CLOUDFLARE_IMG2IMG_ACCOUNT_ID_2: process.env.CLOUDFLARE_IMG2IMG_ACCOUNT_ID_2 ?? '',
    CLOUDFLARE_IMG2IMG_API_TOKEN_2: process.env.CLOUDFLARE_IMG2IMG_API_TOKEN_2 ?? '',
    CLOUDFLARE_IMG2IMG_ACCOUNT_ID_3: process.env.CLOUDFLARE_IMG2IMG_ACCOUNT_ID_3 ?? '',
    CLOUDFLARE_IMG2IMG_API_TOKEN_3: process.env.CLOUDFLARE_IMG2IMG_API_TOKEN_3 ?? '',
    MAX_PARALLEL_SUBAGENTS: Number(process.env.MAX_PARALLEL_SUBAGENTS ?? 3),
    PROVIDER_RETRY_MAX: Number(process.env.PROVIDER_RETRY_MAX ?? 2),
    PROVIDER_RETRY_DELAY_MS: Number(process.env.PROVIDER_RETRY_DELAY_MS ?? 5000),
    PROVIDER_COOLDOWN_MS: Number(process.env.PROVIDER_COOLDOWN_MS ?? 120000),
};
export function validateConfig() {
    const required = [
        ['ANYAPI_AGENT_KEY_1', CONFIG.ANYAPI_AGENT_KEY_1],
        ['REQUESTY_API_KEY', CONFIG.REQUESTY_API_KEY],
        ['NVIDIA_DEEP_AGENT_API_KEY_1', CONFIG.NVIDIA_DEEP_AGENT_API_KEY_1],
        ['OPENROUTER_API_KEY', CONFIG.OPENROUTER_API_KEY],
        ['HUGGINGFACE_API_KEY', CONFIG.HUGGINGFACE_API_KEY],
        ['TAVILY_API_KEY', CONFIG.TAVILY_API_KEY],
        ['NEON_DATABASE_URL', CONFIG.NEON_DATABASE_URL],
    ];
    const missing = required.filter(([, value]) => !value).map(([key]) => key);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}
//# sourceMappingURL=config.js.map