import type { CheckResult } from './providerSwapChecks.js';
import {
  buildProviderModel,
  FreeTierChatModel,
  callTextLlm,
  createChatEmbeddingTool,
  createChatDecisionTool,
  createChatClassificationTool,
  callChatEmbedding,
  callChatDecision,
  callChatClassification,
  DeepAgentRunner,
  type ChatEmbeddingInput,
  type ChatEmbeddingOutput,
  type ChatDecisionInput,
  type ChatDecisionOutput,
} from '../src/index.js';
import { HumanMessage } from '@langchain/core/messages';

/**
 * Validates the new @freetier/orchestrator upgrades:
 * 1) Temperature control in LLM calls for text
 * 2) Calling chatEmbedding (as a LangChain tool and direct programmatic API)
 * 3) Calling chatDecision (as a LangChain tool and direct programmatic API)
 */
export async function runUpgradedFeaturesChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // 1a. buildProviderModel forwards custom temperature or defaults to 0.7
  {
    const modelCustom = buildProviderModel('nvidia', 0, 0, 0.2);
    const modelDefault = buildProviderModel('nvidia', 0, 0);
    const pass = modelCustom.temperature === 0.2 && modelDefault.temperature === 0.7;
    results.push({
      id: 'provider-model-temperature',
      pass,
      detail: pass
        ? 'buildProviderModel applies specified temperature (0.2) and defaults to 0.7.'
        : `Expected custom=0.2 and default=0.7, got custom=${modelCustom.temperature} default=${modelDefault.temperature}`,
    });
  }

  // 1b. FreeTierChatModel forwards temperature to orchestrator
  {
    let receivedPayload: any = null;
    const mockOrchestrator = {
      invoke: async (input: any) => {
        receivedPayload = input;
        return 'Mock response with temperature';
      },
      getCurrentProvider: () => 'mock-provider',
    } as any;

    const chatModel = new FreeTierChatModel({
      temperature: 0.35,
      orchestrator: mockOrchestrator,
    });

    const res = await chatModel.invoke([new HumanMessage('Hello world')]);
    const pass = res.content === 'Mock response with temperature'
      && receivedPayload?.temperature === 0.35
      && receivedPayload?.prompt?.includes('Hello world');

    results.push({
      id: 'free-tier-chat-model-temperature',
      pass,
      detail: pass
        ? 'FreeTierChatModel passes configured temperature (0.35) into orchestrator invoke payload.'
        : `Failed: receivedPayload=${JSON.stringify(receivedPayload)}`,
    });
  }

  // 1c. callTextLlm forwards prompt, system, and temperature
  {
    let receivedPayload: any = null;
    const mockOrchestrator = {
      invoke: async (input: any) => {
        receivedPayload = input;
        return 'Mock text result';
      },
    } as any;

    const output = await callTextLlm(
      { prompt: 'Summarize quantum mechanics', system: 'Be concise', temperature: 0.1 },
      { orchestrator: mockOrchestrator }
    );

    const pass = output === 'Mock text result'
      && receivedPayload?.temperature === 0.1
      && receivedPayload?.prompt === 'Summarize quantum mechanics'
      && receivedPayload?.system === 'Be concise';

    results.push({
      id: 'call-text-llm-temperature',
      pass,
      detail: pass
        ? 'callTextLlm correctly forwards temperature (0.1), prompt, and system to orchestrator.'
        : `Failed: receivedPayload=${JSON.stringify(receivedPayload)}`,
    });
  }

  // 2a. createChatEmbeddingTool LangChain tool creation and schema
  {
    const tool = createChatEmbeddingTool();
    const pass = tool.name === 'chat_embedding'
      && typeof tool.invoke === 'function'
      && tool.description.toLowerCase().includes('embedding');

    results.push({
      id: 'chat-embedding-tool-definition',
      pass,
      detail: pass
        ? 'createChatEmbeddingTool generates tool named "chat_embedding" with proper description and schema.'
        : `Failed: tool name=${tool.name}`,
    });
  }

  // 2b. callChatEmbedding programmatic invocation
  {
    let receivedInput: ChatEmbeddingInput | null = null;
    const mockResult: ChatEmbeddingOutput = {
      model: 'nvidia/nemotron-3.5-embed-1b',
      dimensions: 4,
      texts: ['Deep agents in action'],
      embeddings: [[0.1, 0.2, 0.3, 0.4]],
    };

    const mockOrchestrator = {
      invoke: async (input: ChatEmbeddingInput) => {
        receivedInput = input;
        return mockResult;
      },
    } as any;

    const res = await callChatEmbedding(
      { text: 'Deep agents in action', inputType: 'query' },
      { orchestrator: mockOrchestrator }
    );

    const pass = res.dimensions === 4
      && res.embeddings[0]?.[0] === 0.1
      && receivedInput?.text === 'Deep agents in action'
      && receivedInput?.inputType === 'query';

    results.push({
      id: 'chat-embedding-direct-call',
      pass,
      detail: pass
        ? 'callChatEmbedding programmatically generates vector embeddings and returns typed output.'
        : `Failed: res=${JSON.stringify(res)}, receivedInput=${JSON.stringify(receivedInput)}`,
    });
  }

  // 3a. createChatDecisionTool LangChain tool creation and schema
  {
    const tool = createChatDecisionTool();
    const classificationTool = createChatClassificationTool();
    const pass = tool.name === 'chat_decision'
      && classificationTool.name === 'chat_decision'
      && typeof tool.invoke === 'function';

    results.push({
      id: 'chat-decision-tool-definition',
      pass,
      detail: pass
        ? 'createChatDecisionTool and createChatClassificationTool create valid "chat_decision" tools.'
        : `Failed: tool name=${tool.name}`,
    });
  }

  // 3b. callChatDecision programmatic invocation
  {
    let receivedInput: ChatDecisionInput | null = null;
    const mockResult: ChatDecisionOutput = {
      model: '@cf/cloudflare/clef-flash',
      decision: 'technical_support',
      topCategory: 'technical_support',
      answers: {
        category: {
          type: 'choice',
          selected: 'technical_support',
          confidence: 0.95,
        },
      },
    };

    const mockOrchestrator = {
      invoke: async (input: ChatDecisionInput) => {
        receivedInput = input;
        return mockResult;
      },
    } as any;

    const res = await callChatDecision(
      {
        text: 'The server returns 500 internal server error when fetching todos',
        categories: ['billing', 'sales', 'technical_support'],
      },
      { orchestrator: mockOrchestrator }
    );

    const pass = res.decision === 'technical_support'
      && res.topCategory === 'technical_support'
      && receivedInput?.text?.includes('500 internal server error')
      && receivedInput?.categories?.includes('technical_support');

    results.push({
      id: 'chat-decision-direct-call',
      pass,
      detail: pass
        ? 'callChatDecision evaluates categories and returns structured classification result.'
        : `Failed: res=${JSON.stringify(res)}, receivedInput=${JSON.stringify(receivedInput)}`,
    });
  }

  // 3c. DeepAgentRunner methods chatEmbedding and chatDecision
  {
    const mockDb = {} as any;
    const runner = new DeepAgentRunner(mockDb, { temperature: 0.2 });

    const embeddingMockOrchestrator = {
      invoke: async (input: ChatEmbeddingInput) => ({
        model: 'test-model',
        dimensions: 2,
        texts: [input.text ?? ''],
        embeddings: [[1, 2]],
      }),
    } as any;

    const decisionMockOrchestrator = {
      invoke: async (input: ChatDecisionInput) => ({
        model: 'test-model',
        decision: 'route_a',
        topCategory: 'route_a',
        answers: {},
      }),
    } as any;

    const embRes = await runner.chatEmbedding({ text: 'sample' }, { orchestrator: embeddingMockOrchestrator });
    const decRes = await runner.chatDecision({ text: 'sample', categories: ['route_a'] }, { orchestrator: decisionMockOrchestrator });
    const classRes = await runner.chatClassification({ text: 'sample', categories: ['route_a'] }, { orchestrator: decisionMockOrchestrator });

    const pass = embRes.dimensions === 2
      && decRes.decision === 'route_a'
      && classRes.decision === 'route_a';

    results.push({
      id: 'deep-agent-runner-methods',
      pass,
      detail: pass
        ? 'DeepAgentRunner instance exposes .chatEmbedding(), .chatDecision(), and .chatClassification() methods.'
        : `Failed: embRes=${JSON.stringify(embRes)}, decRes=${JSON.stringify(decRes)}`,
    });
  }

  return results;
}

