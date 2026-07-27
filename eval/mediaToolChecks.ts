import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAudioGenTool, createImageGenTool } from '@freetier/orchestrator';
import type { CheckResult } from './providerSwapChecks.js';

/**
 * Tests the orchestrator-owned image and audio tools with mocked fetch.
 * No provider API, media service, or persistent test output is used.
 */
export async function runMediaToolChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const originalFetch = global.fetch;
  const outputDir = await mkdtemp(join(tmpdir(), 'deep-agent-media-eval-'));
  const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];

  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    requests.push({
      url,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
      text: async () => '',
    } as unknown as Response;
  }) as typeof fetch;

  try {
    const silentLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };
    const imageTool = createImageGenTool({ requestTimeoutMs: 1_000, logger: silentLogger });
    const imagePath = join(outputDir, 'image.png');
    const imageResult = await imageTool.invoke({
      prompt: 'a blue square',
      model: 'flux',
      outputPath: imagePath,
      width: 64,
      height: 64,
    });
    const imageBytes = await readFile(imagePath);
    const imagePass = imageTool.name === 'generate_image'
      && String(imageResult) === imagePath
      && imageBytes.length === 4
      && requests.some((request) => request.url.includes('pollinations'));
    results.push({
      id: 'orchestrator-image-tool',
      pass: imagePass,
      detail: imagePass
        ? 'Orchestrator image tool generated and saved mocked image output.'
        : `Image tool check failed: name=${imageTool.name}, result=${String(imageResult)}, bytes=${imageBytes.length}, requests=${JSON.stringify(requests)}`,
    });

    requests.length = 0;
    const audioTool = createAudioGenTool({ apiKeys: ['test-groq-key'], requestTimeoutMs: 1_000, logger: silentLogger });
    const audioPath = join(outputDir, 'speech.wav');
    const audioResult = await audioTool.invoke({
      input: 'Hello from the eval suite.',
      outputPath: audioPath,
      voice: 'hannah',
      model: 'canopylabs/orpheus-v1-english',
      responseFormat: 'wav',
    });
    const audioBytes = await readFile(audioPath);
    const audioPass = audioTool.name === 'generate_audio'
      && String(audioResult) === audioPath
      && audioBytes.length === 4
      && requests.some((request) => request.url.includes('api.groq.com'))
      && requests.some((request) => request.body?.input === 'Hello from the eval suite.');
    results.push({
      id: 'orchestrator-audio-tool',
      pass: audioPass,
      detail: audioPass
        ? 'Orchestrator audio tool generated and saved mocked audio output.'
        : `Audio tool check failed: name=${audioTool.name}, result=${String(audioResult)}, bytes=${audioBytes.length}, requests=${JSON.stringify(requests)}`,
    });
  } finally {
    global.fetch = originalFetch;
    await rm(outputDir, { recursive: true, force: true });
  }

  return results;
}
