import 'dotenv/config';
/**
 * Centralized, validated runtime configuration.
 * Fails fast on startup if required env vars are missing.
 */
export const CONFIG = {
    NVIDIA_API_KEY: process.env.NVIDIA_API_KEY ?? '',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? '',
    HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY ?? '',
    NVIDIA_DEEP_AGENT_MODEL: process.env.NVIDIA_DEEP_AGENT_MODEL ?? 'z-ai/glm-5.2',
    OPENROUTER_DEEP_AGENT_MODEL: process.env.OPENROUTER_DEEP_AGENT_MODEL ?? 'z-ai/glm-5.2',
    HUGGINGFACE_DEEP_AGENT_MODEL: process.env.HUGGINGFACE_DEEP_AGENT_MODEL ?? 'zai-org/GLM-5.2',
    NVIDIA_BASE_URL: process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
    OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    HUGGINGFACE_BASE_URL: process.env.HUGGINGFACE_BASE_URL ?? 'https://router.huggingface.co/v1',
    TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? '',
    NEON_DATABASE_URL: process.env.NEON_DATABASE_URL ?? '',
    SCRAPE_AGENT_URL: process.env.SCRAPE_AGENT_URL ?? 'https://scrape-agent.onrender.com',
    // Cloudflare Workers AI img2img tool (built-in `generate_image_cloudflare_img2img`
    // tool). Named distinctly from any caller-configured ChatCloudflare keys. Up to 3
    // API tokens sharing one account id are supported for rotation on rate limiting --
    // the tool works with however many of the 3 are actually set (at least 1 required).
    CLOUDFLARE_IMG2IMG_ACCOUNT_ID: process.env.CLOUDFLARE_IMG2IMG_ACCOUNT_ID ?? '',
    CLOUDFLARE_IMG2IMG_API_TOKEN_1: process.env.CLOUDFLARE_IMG2IMG_API_TOKEN_1 ?? '',
    CLOUDFLARE_IMG2IMG_API_TOKEN_2: process.env.CLOUDFLARE_IMG2IMG_API_TOKEN_2 ?? '',
    CLOUDFLARE_IMG2IMG_API_TOKEN_3: process.env.CLOUDFLARE_IMG2IMG_API_TOKEN_3 ?? '',
    MAX_PARALLEL_SUBAGENTS: Number(process.env.MAX_PARALLEL_SUBAGENTS ?? 3),
    PROVIDER_RETRY_MAX: Number(process.env.PROVIDER_RETRY_MAX ?? 2),
    PROVIDER_RETRY_DELAY_MS: Number(process.env.PROVIDER_RETRY_DELAY_MS ?? 5000),
    PROVIDER_COOLDOWN_MS: Number(process.env.PROVIDER_COOLDOWN_MS ?? 120000),
};
export function validateConfig() {
    const required = [
        ['NVIDIA_API_KEY', CONFIG.NVIDIA_API_KEY],
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