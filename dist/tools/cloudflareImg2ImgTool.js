import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { CONFIG } from '../config.js';
/**
 * Image-to-image (reference-conditioned) generation via Cloudflare
 * Workers AI's Stable Diffusion 1.5 img2img model. Use this to edit or
 * re-pose an EXISTING reference image while keeping its visual identity,
 * guided by a text prompt -- distinct from `generate_image_pollinations`,
 * which only generates brand-new images from text with no reference.
 *
 * Retry / key-rotation policy:
 * - Up to 3 API tokens (CLOUDFLARE_IMG2IMG_API_TOKEN_1/2/3, sharing one
 *   CLOUDFLARE_IMG2IMG_ACCOUNT_ID) may be configured. Works with however
 *   many are actually set (minimum 1 required).
 * - On rate limiting (HTTP 429) with the current key, immediately moves
 *   to the next configured key. Fails once all configured keys have
 *   been rate-limited.
 * - On network error or transient/"busy" server error (5xx) with the
 *   current key, retries the SAME key up to 2 more times (3 total
 *   attempts), 10 seconds apart, before moving to the next key.
 */
const CLOUDFLARE_IMG2IMG_MODEL = '@cf/runwayml/stable-diffusion-v1-5-img2img';
const MAX_RETRIES_PER_KEY = 2;
const RETRY_INTERVAL_MS = 10_000;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** Returns whichever of the 1-3 configured img2img API tokens are set. */
function getConfiguredKeys() {
    return [
        CONFIG.CLOUDFLARE_IMG2IMG_API_TOKEN_1,
        CONFIG.CLOUDFLARE_IMG2IMG_API_TOKEN_2,
        CONFIG.CLOUDFLARE_IMG2IMG_API_TOKEN_3,
    ].filter((token) => !!token);
}
/**
 * Core img2img call, exported for direct use by domain code as well as
 * by `createCloudflareImg2ImgTool` below for direct agent invocation.
 */
export async function generateCloudflareImg2Img(params) {
    const accountId = CONFIG.CLOUDFLARE_IMG2IMG_ACCOUNT_ID;
    const keys = getConfiguredKeys();
    if (!accountId || keys.length === 0) {
        throw new Error('Cloudflare img2img is not configured: set CLOUDFLARE_IMG2IMG_ACCOUNT_ID and at least one of ' +
            'CLOUDFLARE_IMG2IMG_API_TOKEN_1/2/3.');
    }
    const strength = params.strength ?? 0.6;
    const imageArray = Array.from(params.imageBytes);
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_IMG2IMG_MODEL}`;
    let lastError;
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
        const apiToken = keys[keyIndex];
        for (let attempt = 0; attempt <= MAX_RETRIES_PER_KEY; attempt++) {
            if (attempt > 0)
                await sleep(RETRY_INTERVAL_MS);
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt: params.prompt, image: imageArray, strength }),
                });
                if (res.status === 429) {
                    lastError = new Error(`Cloudflare img2img rate-limited (429) on key ${keyIndex + 1}/${keys.length}`);
                    break; // stop retrying this key, move to the next one
                }
                if (res.status >= 500) {
                    const text = await res.text().catch(() => '');
                    lastError = new Error(`Cloudflare img2img busy (${res.status}) on key ${keyIndex + 1}: ${text.slice(0, 300)}`);
                    continue; // retry the same key after cool-off
                }
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(`Cloudflare img2img failed (${res.status}): ${text.slice(0, 300)}`);
                }
                return Buffer.from(await res.arrayBuffer());
            }
            catch (err) {
                if (err instanceof Error && err.message.startsWith('Cloudflare img2img failed')) {
                    throw err; // non-retryable client error
                }
                // Network-level error -- treat as transient, retry same key.
                lastError = err instanceof Error ? err : new Error(String(err));
            }
        }
    }
    throw lastError ?? new Error('Cloudflare img2img failed after exhausting all configured keys.');
}
/**
 * Agent-invocable image-to-image tool. Distinct name/description from
 * `generate_image_pollinations` so the deep agent never confuses "edit
 * an existing reference image" with "generate a brand-new image".
 */
export function createCloudflareImg2ImgTool() {
    return new DynamicStructuredTool({
        name: 'generate_image_cloudflare_img2img',
        description: 'Transform/edit an EXISTING reference image using Cloudflare Workers AI Stable Diffusion img2img, guided ' +
            'by a text prompt -- use this to produce a new pose/scene/angle that keeps the visual identity of a ' +
            'reference image (e.g. a locked character reference) while changing pose/background/action per the ' +
            'prompt. Provide the reference image as base64 (PNG/JPEG) plus a prompt describing the desired change. ' +
            'For generating a brand-new image with NO reference image, use `generate_image_pollinations` instead. ' +
            'Automatically rotates across up to 3 configured API keys on rate limiting, and retries transient/busy ' +
            'errors up to 2 more times (10s apart) per key before moving to the next key.',
        schema: z.object({
            imageBase64: z.string().describe('Base64-encoded reference image (PNG or JPEG) to use as the img2img conditioning input.'),
            prompt: z.string().describe('Text prompt describing the desired pose/scene/action, keeping the same visual identity as the reference image.'),
            strength: z.number().min(0).max(1).optional().describe('How much to deviate from the reference image (0 = identical, 1 = ignore reference). Default 0.6.'),
        }),
        func: async ({ imageBase64, prompt, strength }) => {
            const imageBytes = Buffer.from(imageBase64, 'base64');
            const bytes = await generateCloudflareImg2Img({ imageBytes, prompt, strength });
            return JSON.stringify({ imageBase64: bytes.toString('base64'), mimeType: 'image/png' });
        },
    });
}
//# sourceMappingURL=cloudflareImg2ImgTool.js.map