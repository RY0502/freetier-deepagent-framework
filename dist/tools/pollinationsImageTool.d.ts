import { DynamicStructuredTool } from '@langchain/core/tools';
export interface PollinationsImageParams {
    /** Detailed text description of the image to generate. */
    prompt: string;
    /** Pollinations model name, e.g. "flux", "gptimage", "zimage". */
    model: string;
    width?: number;
    height?: number;
    seed?: number;
}
/**
 * Core image-generation call, exported for direct use by domain code
 * (e.g. a caller's own composite tool that needs multiple generations
 * plus its own judging logic) as well as by `createPollinationsImageTool`
 * below for direct agent invocation.
 */
export declare function generatePollinationsImage(params: PollinationsImageParams): Promise<Buffer>;
/**
 * Agent-invocable text-to-image tool. Distinct name/description from
 * `generate_image_cloudflare_img2img` so the deep agent never confuses
 * "generate a new image from a text prompt" with "edit/transform an
 * existing reference image" -- use this one only for the former.
 */
export declare function createPollinationsImageTool(): DynamicStructuredTool;
