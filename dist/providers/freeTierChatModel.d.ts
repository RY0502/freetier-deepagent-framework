import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
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
export declare class FreeTierChatModel extends BaseChatModel {
    private orchestrator;
    constructor(fields?: BaseChatModelParams & {
        callbacks?: BaseCallbackHandler[];
    });
    _llmType(): string;
    _generate(messages: BaseMessage[], _options: unknown, _runManager?: CallbackManagerForLLMRun): Promise<ChatResult>;
    getCurrentProvider(): string;
    bindTools(tools: DynamicStructuredTool[]): this;
}
