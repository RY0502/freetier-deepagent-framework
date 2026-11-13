import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { createTextProviders, FreeTierOrchestrator, type LlmInput } from '@freetier/orchestrator';
import type { DynamicStructuredTool } from '@langchain/core/tools';

export interface FreeTierChatModelParams extends BaseChatModelParams {
  callbacks?: BaseCallbackHandler[];
  /** Sampling temperature to control randomness / creativity (optional). */
  temperature?: number;
  orchestrator?: FreeTierOrchestrator<LlmInput, string>;
}

let defaultTextOrchestrator: FreeTierOrchestrator<LlmInput, string> | null = null;

export function getTextOrchestrator(): FreeTierOrchestrator<LlmInput, string> {
  if (!defaultTextOrchestrator) {
    defaultTextOrchestrator = new FreeTierOrchestrator(createTextProviders());
  }
  return defaultTextOrchestrator;
}

/**
 * Direct helper to invoke free-tier text generation with temperature control.
 */
export async function callTextLlm(
  input: { prompt: string; system?: string; temperature?: number; imageBase64?: string; mimeType?: string },
  options?: { orchestrator?: FreeTierOrchestrator<LlmInput, string> }
): Promise<string> {
  const orchestrator = options?.orchestrator ?? getTextOrchestrator();
  return orchestrator.invoke({
    system: input.system ?? '',
    prompt: input.prompt,
    temperature: input.temperature,
    imageBase64: input.imageBase64,
    mimeType: input.mimeType,
  });
}

/**
 * LangChain `BaseChatModel` adapter around `@freetier/orchestrator`.
 *
 * Sub-agents (text or vision) are first-class LangChain agents like the
 * main deep agent, but their own LLM calls are delegated to the
 * `@freetier/orchestrator` package so that free-tier rotation across
 * Groq/HuggingFace/NVIDIA/SambaNova/Cerebras/Cloudflare is handled
 * automatically and independently of the main deep agent's own
 * NVIDIA/HuggingFace/OpenRouter GLM rotation (per design: "we don't need
 * to worry about the sub agents quota ... these will be handled by
 * free-tier orchestrator").
 */
export class FreeTierChatModel extends BaseChatModel {
  public temperature?: number;
  private orchestrator: FreeTierOrchestrator<LlmInput, string>;

  constructor(fields?: FreeTierChatModelParams) {
    super(fields ?? {});
    this.temperature = fields?.temperature;
    this.orchestrator = fields?.orchestrator ?? getTextOrchestrator();
  }

  _llmType(): string {
    return 'freetier-orchestrator';
  }

  async _generate(messages: BaseMessage[], options: unknown, _runManager?: CallbackManagerForLLMRun): Promise<ChatResult> {
    const systemMessage = messages.find((m) => m._getType() === 'system');
    const nonSystemMessages = messages.filter((m) => m._getType() !== 'system');
    const prompt = nonSystemMessages.map((m) => `${m._getType()}: ${m.content}`).join('\n');

    const callTemperature = (options as any)?.temperature ?? this.temperature;

    const text = await this.orchestrator.invoke({
      system: systemMessage ? String(systemMessage.content) : '',
      prompt,
      temperature: callTemperature,
    });

    return {
      generations: [
        {
          text,
          message: new AIMessage(text),
        },
      ],
    };
  }

  getCurrentProvider(): string {
    return this.orchestrator.getCurrentProvider();
  }

  bindTools(tools: DynamicStructuredTool[]): this {
    return this;
  }
}
