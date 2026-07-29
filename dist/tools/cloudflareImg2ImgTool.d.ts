import { DynamicStructuredTool } from '@langchain/core/tools';
export interface CloudflareImg2ImgParams {
    /** Reference image bytes (PNG/JPEG) to use as the img2img conditioning input. */
    imageBytes: Buffer;
    /** Text prompt describing the desired pose/scene/action. */
    prompt: string;
    /** How much to deviate from the reference image (0 = identical, 1 = ignore reference). Default 0.6. */
    strength?: number;
}
/**
 * Core img2img call, exported for direct use by domain code as well as
 * by `createCloudflareImg2ImgTool` below for direct agent invocation.
 */
export declare function generateCloudflareImg2Img(params: CloudflareImg2ImgParams): Promise<Buffer>;
/**
 * Agent-invocable image-to-image tool. Distinct name/description from
 * `generate_image` so the deep agent never confuses "edit
 * an existing reference image" with "generate a brand-new image".
 */
export declare function createCloudflareImg2ImgTool(): DynamicStructuredTool;
