import { ChatOpenAI } from '@langchain/openai';
export type ProviderName = 'nvidia' | 'requesty' | 'openrouter' | 'anyapi' | 'huggingface';
export declare const PROVIDER_ORDER: ProviderName[];
/**
 * Builds a LangChain-compatible chat model for the given provider.
 *
 * NVIDIA NIM, the HuggingFace Inference Router, and OpenRouter all expose
 * OpenAI-compatible `/chat/completions` endpoints, so a single `ChatOpenAI`
 * client configured with the provider's base URL, API key, and GLM model
 * id is sufficient — no bespoke per-provider SDK is required. This model
 * is passed directly to `createDeepAgent({ model })`.
 */
export declare function buildProviderModel(provider: ProviderName, nvidiaKeyIndex?: number, anyApiKeyIndex?: number): ChatOpenAI;
/**
 * Tracks which provider is currently active for a run and rotates to the
 * next one in `PROVIDER_ORDER` on quota exhaustion. Once every provider
 * has been tried and exhausted within a single rotation pass, throws so
 * the caller can persist a 'failed' run status.
 */
export declare class ProviderManager {
    private currentIndex;
    private nvidiaKeyIndex;
    private anyApiKeyIndex;
    constructor(startProvider?: ProviderName, startNvidiaKeyIndex?: number, startAnyApiKeyIndex?: number);
    get current(): ProviderName;
    /** Returns the active NVIDIA key index when NVIDIA is the current provider. */
    get currentNvidiaKeyIndex(): number;
    /** Returns the active AnyApi key index when AnyApi is the current provider. */
    get currentAnyApiKeyIndex(): number;
    getModel(): ChatOpenAI;
    /**
     * Advances to the next NVIDIA key, next AnyApi key, or next provider.
     * Returns null once all providers have been exhausted in this rotation.
     */
    switchToNext(): ProviderName | null;
    /** Returns true while another key or provider remains available to try. */
    hasMoreProviders(): boolean;
}
