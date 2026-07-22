import { ChatOpenAI } from '@langchain/openai';
import { CONFIG } from '../config.js';
export const PROVIDER_ORDER = ['nvidia', 'openrouter', 'huggingface'];
function providerDefs() {
    return {
        nvidia: {
            name: 'nvidia',
            apiKey: CONFIG.NVIDIA_API_KEY,
            baseURL: CONFIG.NVIDIA_BASE_URL,
            model: CONFIG.NVIDIA_DEEP_AGENT_MODEL,
        },
        openrouter: {
            name: 'openrouter',
            apiKey: CONFIG.OPENROUTER_API_KEY,
            baseURL: CONFIG.OPENROUTER_BASE_URL,
            model: CONFIG.OPENROUTER_DEEP_AGENT_MODEL,
        },
        huggingface: {
            name: 'huggingface',
            apiKey: CONFIG.HUGGINGFACE_API_KEY,
            baseURL: CONFIG.HUGGINGFACE_BASE_URL,
            model: CONFIG.HUGGINGFACE_DEEP_AGENT_MODEL,
        },
    };
}
/**
 * Builds a LangChain-compatible chat model for the given provider.
 *
 * NVIDIA NIM, the HuggingFace Inference Router, and OpenRouter all expose
 * OpenAI-compatible `/chat/completions` endpoints, so a single `ChatOpenAI`
 * client configured with the provider's base URL, API key, and GLM model
 * id is sufficient — no bespoke per-provider SDK is required. This model
 * is passed directly to `createDeepAgent({ model })`.
 */
export function buildProviderModel(provider) {
    const def = providerDefs()[provider];
    return new ChatOpenAI({
        apiKey: def.apiKey,
        model: def.model,
        temperature: 0.7,
        configuration: {
            baseURL: def.baseURL,
        },
    });
}
/**
 * Tracks which provider is currently active for a run and rotates to the
 * next one in `PROVIDER_ORDER` on quota exhaustion. Once every provider
 * has been tried and exhausted within a single rotation pass, throws so
 * the caller can persist a 'failed' run status.
 */
export class ProviderManager {
    currentIndex;
    constructor(startProvider) {
        this.currentIndex = startProvider ? PROVIDER_ORDER.indexOf(startProvider) : 0;
        if (this.currentIndex === -1)
            this.currentIndex = 0;
    }
    get current() {
        return PROVIDER_ORDER[this.currentIndex];
    }
    getModel() {
        return buildProviderModel(this.current);
    }
    /**
     * Advances to the next provider. Returns null once all providers have
     * been exhausted in this rotation (caller should treat this as fatal).
     */
    switchToNext() {
        if (this.currentIndex + 1 >= PROVIDER_ORDER.length) {
            return null;
        }
        this.currentIndex += 1;
        return this.current;
    }
    hasMoreProviders() {
        return this.currentIndex + 1 < PROVIDER_ORDER.length;
    }
}
//# sourceMappingURL=providerManager.js.map