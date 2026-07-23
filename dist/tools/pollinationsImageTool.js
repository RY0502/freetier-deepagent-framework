import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
/**
 * Text-to-image generation via the Pollinations AI API
 * (https://image.pollinations.ai/prompt/{prompt}?model=...). No API key
 * required. Caller supplies the model name (e.g. "flux", "gptimage",
 * "zimage") and prompt.
 *
 * Retry policy:
 * - HTTP 429 (rate limited): wait 60s cool-off, then retry.
 * - HTTP 5xx / network error ("busy"/transient): retry up to 3 more
 *   times with a short linear backoff (2s, 4s, 6s).
 */
const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt';
const MAX_RETRIES = 3;
const RATE_LIMIT_COOLOFF_MS = 60_000;
const TRANSIENT_RETRY_BASE_MS = 2_000;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Core image-generation call, exported for direct use by domain code
 * (e.g. a caller's own composite tool that needs multiple generations
 * plus its own judging logic) as well as by `createPollinationsImageTool`
 * below for direct agent invocation.
 */
export async function generatePollinationsImage(params) {
    const { prompt, model, width = 1024, height = 1024, seed } = params;
    const encodedPrompt = encodeURIComponent(prompt);
    const urlParts = [
        `${POLLINATIONS_BASE}/${encodedPrompt}`,
        `?model=${encodeURIComponent(model)}`,
        `&width=${width}`,
        `&height=${height}`,
        `&nologo=true`,
    ];
    if (seed !== undefined)
        urlParts.push(`&seed=${seed}`);
    const url = urlParts.join('');
    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(url, { method: 'GET' });
            if (res.status === 429) {
                lastError = new Error(`Pollinations rate-limited (429) for model="${model}"`);
                if (attempt < MAX_RETRIES)
                    await sleep(RATE_LIMIT_COOLOFF_MS);
                continue;
            }
            if (res.status >= 500) {
                const text = await res.text().catch(() => '');
                lastError = new Error(`Pollinations server busy (${res.status}) for model="${model}": ${text.slice(0, 300)}`);
                if (attempt < MAX_RETRIES)
                    await sleep(TRANSIENT_RETRY_BASE_MS * (attempt + 1));
                continue;
            }
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`Pollinations image generation failed (${res.status}): ${text.slice(0, 300)}`);
            }
            return Buffer.from(await res.arrayBuffer());
        }
        catch (err) {
            if (err instanceof Error && err.message.startsWith('Pollinations image generation failed')) {
                throw err; // non-retryable client error (4xx other than 429)
            }
            // Network-level error (fetch threw) -- treat as transient/busy.
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt < MAX_RETRIES)
                await sleep(TRANSIENT_RETRY_BASE_MS * (attempt + 1));
        }
    }
    throw lastError ?? new Error('Pollinations image generation failed after all retries.');
}
/**
 * Agent-invocable text-to-image tool. Distinct name/description from
 * `generate_image_cloudflare_img2img` so the deep agent never confuses
 * "generate a new image from a text prompt" with "edit/transform an
 * existing reference image" -- use this one only for the former.
 */
export function createPollinationsImageTool() {
    return new DynamicStructuredTool({
        name: 'generate_image_pollinations',
        description: 'Generate a brand-new image from a text prompt only (no reference image) using the Pollinations AI ' +
            'text-to-image API. Provide the exact model name (e.g. "flux", "gptimage", "zimage", "seedream") and a ' +
            'detailed prompt. Returns a base64-encoded PNG. Use `generate_image_cloudflare_img2img` instead when you ' +
            'need to edit/transform an EXISTING reference image while preserving its visual identity. Automatically ' +
            'retries on rate limiting (60s cool-off) and transient server errors (up to 3 more times).',
        schema: z.object({
            prompt: z.string().describe('Detailed text description of the image to generate.'),
            model: z.string().describe('Pollinations model name to use, e.g. "flux", "gptimage", "zimage", "seedream".'),
            width: z.number().int().min(64).max(2048).optional().describe('Image width in pixels (default 1024).'),
            height: z.number().int().min(64).max(2048).optional().describe('Image height in pixels (default 1024).'),
            seed: z.number().int().optional().describe('Optional seed for reproducible generation.'),
        }),
        func: async ({ prompt, model, width, height, seed }) => {
            const bytes = await generatePollinationsImage({ prompt, model, width, height, seed });
            return JSON.stringify({ imageBase64: bytes.toString('base64'), mimeType: 'image/png' });
        },
    });
}
//# sourceMappingURL=pollinationsImageTool.js.map