import { ChatOpenAI } from '@langchain/openai';
import { CONFIG } from '../config.js';

export type ProviderName = 'anyapi' | 'requesty' | 'nvidia' | 'openrouter' | 'huggingface';

export const PROVIDER_ORDER: ProviderName[] = ['anyapi', 'requesty', 'nvidia', 'openrouter', 'huggingface'];

interface ProviderDef {
  name: ProviderName;
  apiKey: string;
  baseURL: string;
  model: string;
}

function getAnyApiKeys(): string[] {
  return [CONFIG.ANYAPI_AGENT_KEY_1, CONFIG.ANYAPI_AGENT_KEY_2, CONFIG.ANYAPI_AGENT_KEY_3, CONFIG.ANYAPI_AGENT_KEY_4].filter(Boolean);
}

function providerDefs(anyApiKeyIndex: number): Record<ProviderName, ProviderDef> {
  const anyApiKeys = getAnyApiKeys();
  return {
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
export function buildProviderModel(provider: ProviderName, anyApiKeyIndex = 0): ChatOpenAI {
  const def = providerDefs(anyApiKeyIndex)[provider];
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
  private currentIndex: number;
  private anyApiKeyIndex: number;

  constructor(startProvider?: ProviderName, startAnyApiKeyIndex = 0) {
    this.currentIndex = startProvider ? PROVIDER_ORDER.indexOf(startProvider) : 0;
    if (this.currentIndex === -1) this.currentIndex = 0;
    this.anyApiKeyIndex = startAnyApiKeyIndex;
  }

  get current(): ProviderName {
    return PROVIDER_ORDER[this.currentIndex];
  }

  get currentAnyApiKeyIndex(): number {
    return this.anyApiKeyIndex;
  }

  getModel(): ChatOpenAI {
    return buildProviderModel(this.current, this.anyApiKeyIndex);
  }

  /**
   * Advances to the next provider. Returns null once all providers have
   * been exhausted in this rotation (caller should treat this as fatal).
   */
  switchToNext(): ProviderName | null {
    const anyApiKeys = getAnyApiKeys();
    if (this.current === 'anyapi' && this.anyApiKeyIndex + 1 < anyApiKeys.length) {
      this.anyApiKeyIndex += 1;
      return this.current;
    }

    if (this.currentIndex + 1 >= PROVIDER_ORDER.length) {
      return null;
    }
    this.currentIndex += 1;
    this.anyApiKeyIndex = 0;
    return this.current;
  }

  hasMoreProviders(): boolean {
    const anyApiKeys = getAnyApiKeys();
    if (this.current === 'anyapi' && this.anyApiKeyIndex + 1 < anyApiKeys.length) {
      return true;
    }
    return this.currentIndex + 1 < PROVIDER_ORDER.length;
  }
}
