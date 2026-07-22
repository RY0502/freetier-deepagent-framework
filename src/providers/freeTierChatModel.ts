import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { createProviders, FreeTierOrchestrator } from '@freetier/orchestrator';
import type { DynamicStructuredTool } from '@langchain/core/tools';

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
  private orchestrator: FreeTierOrchestrator<{ system?: string; prompt: string; imageBase64?: string; mimeType?: string }, string>;

  constructor(fields?: BaseChatModelParams & { callbacks?: BaseCallbackHandler[] }) {
    super(fields ?? {});
    const providers = createProviders();
    this.orchestrator = new FreeTierOrchestrator(providers);
  }

  _llmType(): string {
    return 'freetier-orchestrator';
  }

  async _generate(messages: BaseMessage[], _options: unknown, _runManager?: CallbackManagerForLLMRun): Promise<ChatResult> {
    const systemMessage = messages.find((m) => m._getType() === 'system');
    const nonSystemMessages = messages.filter((m) => m._getType() !== 'system');
    const prompt = nonSystemMessages.map((m) => `${m._getType()}: ${m.content}`).join('\n');

    const text = await this.orchestrator.invoke({
      system: systemMessage ? String(systemMessage.content) : undefined,
      prompt,
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
