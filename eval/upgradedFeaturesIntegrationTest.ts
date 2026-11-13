/**
 * Integration test suite for upgraded @freetier/orchestrator capabilities:
 * 1. Temperature control in LLM text calls (DeepAgentRunner options, buildProviderModel, ChatOpenAI)
 * 2. chatEmbedding (live integration with NVIDIA embedding provider via runner and standalone functions/tools)
 * 3. chatDecision (Cloudflare clef-flash integration check with key validation & graceful reporting)
 *
 * Usage:
 *   npm run test:upgrades
 *   or: tsx eval/upgradedFeaturesIntegrationTest.ts
 */
import { CONFIG } from '../src/config.js';
import { DatabaseClient } from '../src/db/client.js';
import {
  DeepAgentRunner,
  callChatEmbedding,
  callChatDecision,
  createChatEmbeddingTool,
  createChatDecisionTool,
  FreeTierEmbeddings,
} from '../src/index.js';
import { ChatOpenAI } from '@langchain/openai';

interface TestStepResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

const results: TestStepResult[] = [];

function recordResult(name: string, passed: boolean, message: string, durationMs: number): void {
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} [${name}] (${durationMs}ms): ${message}`);
  results.push({ name, passed, message, durationMs });
}

async function runIntegrationSuite(): Promise<void> {
  console.log('='.repeat(65));
  console.log('Live Integration Test: Upgraded @freetier/orchestrator Features');
  console.log('='.repeat(65));

  // -------------------------------------------------------------
  // Test 1: Temperature in LLM text calls
  // -------------------------------------------------------------
  console.log('\n--- Test 1: Temperature in LLM text calls ---');
  const t1Start = Date.now();
  try {
    const testTemperature = 0.2;
    const model = new ChatOpenAI({
      apiKey: CONFIG.NVIDIA_API_KEY,
      model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
      temperature: testTemperature,
      configuration: {
        baseURL: CONFIG.NVIDIA_BASE_URL,
      },
    });

    const prompt = 'Say "integration test passed" and nothing else.';
    const response = await model.invoke(prompt);
    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const passed = model.temperature === testTemperature && text.trim().length > 0;
    recordResult(
      'llm-temperature-text-call',
      passed,
      `Model configured with temperature ${model.temperature}; live response received: "${text.trim().slice(0, 80)}"`,
      Date.now() - t1Start
    );
  } catch (err) {
    recordResult(
      'llm-temperature-text-call',
      false,
      `Failed: ${err instanceof Error ? err.message : String(err)}`,
      Date.now() - t1Start
    );
  }

  // -------------------------------------------------------------
  // Test 2: chatEmbedding (NVIDIA live integration)
  // -------------------------------------------------------------
  console.log('\n--- Test 2: chatEmbedding (Live NVIDIA Free-Tier Embeddings) ---');
  const t2Start = Date.now();
  try {
    const embeddingInput = {
      text: 'DeepAgent autonomous planning with durable state',
      inputType: 'query' as const,
    };
    const embedResult = await callChatEmbedding(embeddingInput);
    const passed = embedResult.dimensions > 0 && embedResult.embeddings.length === 1 && embedResult.embeddings[0].length === embedResult.dimensions;
    recordResult(
      'chat-embedding-direct-call',
      passed,
      `Successfully generated embedding vector (dims: ${embedResult.dimensions}, model: ${embedResult.model})`,
      Date.now() - t2Start
    );
  } catch (err) {
    recordResult(
      'chat-embedding-direct-call',
      false,
      `Failed: ${err instanceof Error ? err.message : String(err)}`,
      Date.now() - t2Start
    );
  }

  // Test 2b: chatEmbedding tool invocation
  const t2bStart = Date.now();
  try {
    const tool = createChatEmbeddingTool();
    const toolRaw = await tool.invoke({ text: 'LangChain tool embedding chunk', inputType: 'passage' });
    const toolParsed = JSON.parse(toolRaw);
    const passed = tool.name === 'chat_embedding' && toolParsed.dimensions > 0 && toolParsed.count === 1;
    recordResult(
      'chat-embedding-tool-call',
      passed,
      `LangChain tool "chat_embedding" invoked live, returned ${toolParsed.dimensions}-dim vector`,
      Date.now() - t2bStart
    );
  } catch (err) {
    recordResult(
      'chat-embedding-tool-call',
      false,
      `Failed: ${err instanceof Error ? err.message : String(err)}`,
      Date.now() - t2bStart
    );
  }

  // Test 2c: FreeTierEmbeddings LangChain adapter
  const t2cStart = Date.now();
  try {
    const embeddings = new FreeTierEmbeddings();
    const queryVector = await embeddings.embedQuery('Query for similarity search');
    const docVectors = await embeddings.embedDocuments(['Doc A: system overview', 'Doc B: agent tools']);
    const passed = queryVector.length > 0 && docVectors.length === 2 && docVectors[0].length === queryVector.length;
    recordResult(
      'freetier-embeddings-langchain-class',
      passed,
      `FreeTierEmbeddings embedQuery (${queryVector.length} dims) & embedDocuments (2 docs) succeeded`,
      Date.now() - t2cStart
    );
  } catch (err) {
    recordResult(
      'freetier-embeddings-langchain-class',
      false,
      `Failed: ${err instanceof Error ? err.message : String(err)}`,
      Date.now() - t2cStart
    );
  }

  // -------------------------------------------------------------
  // Test 3: chatDecision (Cloudflare clef-flash verification)
  // -------------------------------------------------------------
  console.log('\n--- Test 3: chatDecision (Cloudflare Workers AI clef-flash) ---');
  const t3Start = Date.now();
  try {
    const decisionResult = await callChatDecision({
      text: 'My credit card was charged twice for the monthly subscription',
      categories: ['billing', 'sales', 'technical_support'],
    });

    const passed = Boolean(decisionResult.decision || decisionResult.topCategory);
    recordResult(
      'chat-decision-live-call',
      passed,
      `Decision generated: "${decisionResult.decision ?? decisionResult.topCategory}" (model: ${decisionResult.model})`,
      Date.now() - t3Start
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes('401') || errMsg.includes('Authentication error')) {
      recordResult(
        'chat-decision-live-call',
        false,
        `Cloudflare credentials returned HTTP 401 Authentication error. Check CLOUDFLARE_API_TOKEN in .env.`,
        Date.now() - t3Start
      );
    } else {
      recordResult(
        'chat-decision-live-call',
        false,
        `Failed: ${errMsg}`,
        Date.now() - t3Start
      );
    }
  }

  // Test 3b: chatDecision tool definition and contract
  const t3bStart = Date.now();
  try {
    const tool = createChatDecisionTool();
    const passed = tool.name === 'chat_decision' && typeof tool.invoke === 'function';
    recordResult(
      'chat-decision-tool-definition',
      passed,
      `LangChain tool "chat_decision" correctly constructed with proper schema and name`,
      Date.now() - t3bStart
    );
  } catch (err) {
    recordResult(
      'chat-decision-tool-definition',
      false,
      `Failed: ${err instanceof Error ? err.message : String(err)}`,
      Date.now() - t3bStart
    );
  }

  // -------------------------------------------------------------
  // Test 4: DeepAgentRunner Integration
  // -------------------------------------------------------------
  console.log('\n--- Test 4: DeepAgentRunner Integration ---');
  const t4Start = Date.now();
  try {
    const db = new DatabaseClient(CONFIG.NEON_DATABASE_URL);
    const runner = new DeepAgentRunner(db, { temperature: 0.1 });

    // Verify embedding through runner instance
    const runnerEmbedding = await runner.chatEmbedding({
      text: 'Verifying deep agent runner embedding invocation',
      inputType: 'query',
    });

    const passed = runnerEmbedding.dimensions > 0;
    recordResult(
      'deepagent-runner-instance-integration',
      passed,
      `DeepAgentRunner instance initialized with temperature 0.1 and invoked runner.chatEmbedding (${runnerEmbedding.dimensions} dims)`,
      Date.now() - t4Start
    );
  } catch (err) {
    recordResult(
      'deepagent-runner-instance-integration',
      false,
      `Failed: ${err instanceof Error ? err.message : String(err)}`,
      Date.now() - t4Start
    );
  }

  // Summary
  console.log('\n' + '='.repeat(65));
  console.log('SUMMARY');
  console.log('='.repeat(65));
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(`Passed: ${passedCount}/${totalCount}`);
  if (passedCount < totalCount) {
    console.log(`\nNote: For tests that failed with authentication errors, please verify the corresponding API token in .env.`);
  }
}

runIntegrationSuite().catch(console.error);

