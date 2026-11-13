import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import { type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { FreeTierOrchestrator, type LlmInput } from '@freetier/orchestrator';
import type { DynamicStructuredTool } from '@langchain/core/tools';
export interface FreeTierChatModelParams extends BaseChatModelParams {
    callbacks?: BaseCallbackHandler[];
    /** Sampling temperature to control randomness / creativity (optional). */
    temperature?: number;
    orchestrator?: FreeTierOrchestrator<LlmInput, string>;
}
export declare function getTextOrchestrator(): FreeTierOrchestrator<LlmInput, string>;
/**
 * Direct helper to invoke free-tier text generation with temperature control.
 */
export declare function callTextLlm(input: {
    prompt: string;
    system?: string;
    temperature?: number;
    imageBase64?: string;
    mimeType?: string;
}, options?: {
    orchestrator?: FreeTierOrchestrator<LlmInput, string>;
}): Promise<string>;
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
    temperature?: number;
    private orchestrator;
    constructor(fields?: FreeTierChatModelParams);
    _llmType(): string;
    _generate(messages: BaseMessage[], options: unknown, _runManager?: CallbackManagerForLLMRun): Promise<ChatResult>;
    getCurrentProvider(): string;
    bindTools(tools: DynamicStructuredTool[]): this;
}
