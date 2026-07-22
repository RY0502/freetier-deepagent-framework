import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';
import { createProviders, FreeTierOrchestrator } from '@freetier/orchestrator';
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
    orchestrator;
    constructor(fields) {
        super(fields ?? {});
        const providers = createProviders();
        this.orchestrator = new FreeTierOrchestrator(providers);
    }
    _llmType() {
        return 'freetier-orchestrator';
    }
    async _generate(messages, _options, _runManager) {
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
    getCurrentProvider() {
        return this.orchestrator.getCurrentProvider();
    }
    bindTools(tools) {
        return this;
    }
}
//# sourceMappingURL=freeTierChatModel.js.map