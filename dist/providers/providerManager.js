import { ChatOpenAI } from '@langchain/openai';
import { CONFIG } from '../config.js';
export const PROVIDER_ORDER = ['nvidia', 'anyapi', 'requesty', 'openrouter', 'huggingface'];
/** Returns the configured NVIDIA deep-agent keys in rotation order. */
function getNvidiaKeys() {
    return [CONFIG.NVIDIA_DEEP_AGENT_API_KEY_1, CONFIG.NVIDIA_DEEP_AGENT_API_KEY_2, CONFIG.NVIDIA_DEEP_AGENT_API_KEY_3, CONFIG.NVIDIA_DEEP_AGENT_API_KEY_4].filter(Boolean);
}
/** Returns the configured AnyApi keys in rotation order. */
function getAnyApiKeys() {
    return [CONFIG.ANYAPI_AGENT_KEY_1, CONFIG.ANYAPI_AGENT_KEY_2, CONFIG.ANYAPI_AGENT_KEY_3, CONFIG.ANYAPI_AGENT_KEY_4].filter(Boolean);
}
function providerDefs(nvidiaKeyIndex, anyApiKeyIndex) {
    const nvidiaKeys = getNvidiaKeys();
    const anyApiKeys = getAnyApiKeys();
    return {
        nvidia: {
            name: 'nvidia',
            apiKey: nvidiaKeys[nvidiaKeyIndex] ?? nvidiaKeys[0] ?? '',
            baseURL: CONFIG.NVIDIA_BASE_URL,
            model: CONFIG.NVIDIA_DEEP_AGENT_MODEL,
        },
        anyapi: {
            name: 'anyapi',
            apiKey: anyApiKeys[anyApiKeyIndex] ?? anyApiKeys[0] ?? '',
            baseURL: CONFIG.ANYAPI_BASE_URL,
            model: CONFIG.ANYAPI_DEEP_AGENT_MODEL,
        },
        requesty: {
            name: 'requesty',
            apiKey: CONFIG.REQUESTY_API_KEY,
            baseURL: CONFIG.REQUESTY_BASE_URL,
            model: CONFIG.REQUESTY_DEEP_AGENT_MODEL,
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
export function buildProviderModel(provider, nvidiaKeyIndex = 0, anyApiKeyIndex = 0) {
    const def = providerDefs(nvidiaKeyIndex, anyApiKeyIndex)[provider];
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
    nvidiaKeyIndex;
    anyApiKeyIndex;
    constructor(startProvider, startNvidiaKeyIndex = 0, startAnyApiKeyIndex = 0) {
        this.currentIndex = startProvider ? PROVIDER_ORDER.indexOf(startProvider) : 0;
        if (this.currentIndex === -1)
            this.currentIndex = 0;
        this.nvidiaKeyIndex = startNvidiaKeyIndex;
        this.anyApiKeyIndex = startAnyApiKeyIndex;
    }
    get current() {
        return PROVIDER_ORDER[this.currentIndex];
    }
    /** Returns the active NVIDIA key index when NVIDIA is the current provider. */
    get currentNvidiaKeyIndex() {
        return this.nvidiaKeyIndex;
    }
    /** Returns the active AnyApi key index when AnyApi is the current provider. */
    get currentAnyApiKeyIndex() {
        return this.anyApiKeyIndex;
    }
    getModel() {
        return buildProviderModel(this.current, this.nvidiaKeyIndex, this.anyApiKeyIndex);
    }
    /**
     * Advances to the next NVIDIA key, next AnyApi key, or next provider.
     * Returns null once all providers have been exhausted in this rotation.
     */
    switchToNext() {
        const nvidiaKeys = getNvidiaKeys();
        const anyApiKeys = getAnyApiKeys();
        if (this.current === 'nvidia' && this.nvidiaKeyIndex + 1 < nvidiaKeys.length) {
            this.nvidiaKeyIndex += 1;
            return this.current;
        }
        if (this.current === 'anyapi' && this.anyApiKeyIndex + 1 < anyApiKeys.length) {
            this.anyApiKeyIndex += 1;
            return this.current;
        }
        if (this.currentIndex + 1 >= PROVIDER_ORDER.length) {
            return null;
        }
        this.currentIndex += 1;
        this.nvidiaKeyIndex = 0;
        this.anyApiKeyIndex = 0;
        return this.current;
    }
    /** Returns true while another key or provider remains available to try. */
    hasMoreProviders() {
        const nvidiaKeys = getNvidiaKeys();
        const anyApiKeys = getAnyApiKeys();
        if (this.current === 'nvidia' && this.nvidiaKeyIndex + 1 < nvidiaKeys.length) {
            return true;
        }
        if (this.current === 'anyapi' && this.anyApiKeyIndex + 1 < anyApiKeys.length) {
            return true;
        }
        return this.currentIndex + 1 < PROVIDER_ORDER.length;
    }
}
//# sourceMappingURL=providerManager.js.map