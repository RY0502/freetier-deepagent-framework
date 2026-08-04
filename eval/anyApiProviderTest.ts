/**
 * Live integration test for the AnyApi provider.
 *
 * Verifies that:
 * 1. The AnyApi provider can be initialized with the configured base URL and model.
 * 2. It can successfully make a chat completion request.
 * 3. It returns a valid non-empty response.
 *
 * Usage:
 *   ANYAPI_AGENT_KEY_1=your_key tsx eval/anyApiProviderTest.ts
 */
import { CONFIG } from '../src/config.js';
import { buildProviderModel } from '../src/providers/providerManager.js';

async function testAnyApiProvider(): Promise<void> {
  console.log('='.repeat(60));
  console.log('AnyApi Provider Live Integration Test');
  console.log('='.repeat(60));

  if (!CONFIG.ANYAPI_AGENT_KEY_1) {
    console.error('❌ ANYAPI_AGENT_KEY_1 is not set in environment variables.');
    console.error('   Set it in .env or pass it directly: ANYAPI_AGENT_KEY_1=your_key tsx eval/anyApiProviderTest.ts');
    process.exit(1);
  }

  console.log('\n✓ ANYAPI_AGENT_KEY_1 is configured');
  console.log(`✓ Model: ${CONFIG.ANYAPI_DEEP_AGENT_MODEL}`);
  console.log(`✓ Base URL: ${CONFIG.ANYAPI_BASE_URL}`);

  try {
    console.log('\n--- Building AnyApi model ---');
    const model = buildProviderModel('anyapi');
    console.log('✓ Model built successfully');

    console.log('\n--- Sending test chat completion request ---');
    const testPrompt = 'Say "Hello from AnyApi!" and nothing else.';
    console.log(`Prompt: "${testPrompt}"`);

    const startTime = Date.now();
    const response = await model.invoke(testPrompt);
    const duration = Date.now() - startTime;

    const responseText = typeof response.content === 'string'
      ? response.content
      : Array.isArray(response.content)
        ? response.content.map((part) => typeof part === 'string' ? part : ('text' in part ? String(part.text ?? '') : '')).join('')
        : String(response.content ?? '');

    console.log(`\n✓ Response received in ${duration}ms`);
    console.log(`Response content: "${responseText}"`);

    if (!responseText || responseText.trim().length === 0) {
      throw new Error('Invalid response: content is empty');
    }

    console.log('\n✓ Response validation passed');
    console.log('\n' + '='.repeat(60));
    console.log('✅ AnyApi provider test PASSED');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ AnyApi provider test FAILED');
    console.error('='.repeat(60));
    console.error('\nError details:');
    if (error instanceof Error) {
      console.error(`  Message: ${error.message}`);
      console.error(`  Stack: ${error.stack}`);
    } else {
      console.error(`  ${String(error)}`);
    }
    process.exit(1);
  }
}

testAnyApiProvider();
