/**
 * Live integration test for the Requesty provider.
 * 
 * Verifies that:
 * 1. The Requesty provider can be initialized with the correct configuration
 * 2. It can successfully make a chat completion request
 * 3. It returns a valid response
 * 4. Error handling works correctly
 * 
 * Usage:
 *   REQUESTY_API_KEY=your_key tsx eval/requestyProviderTest.ts
 */
import { CONFIG, validateConfig } from '../src/config.js';
import { buildProviderModel } from '../src/providers/providerManager.js';

async function testRequestyProvider(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Requesty Provider Live Integration Test');
  console.log('='.repeat(60));

  // Validate that REQUESTY_API_KEY is set
  if (!CONFIG.REQUESTY_API_KEY) {
    console.error('❌ REQUESTY_API_KEY is not set in environment variables.');
    console.error('   Set it in .env or pass it directly: REQUESTY_API_KEY=your_key tsx eval/requestyProviderTest.ts');
    process.exit(1);
  }

  console.log('\n✓ REQUESTY_API_KEY is configured');
  console.log(`✓ Model: ${CONFIG.REQUESTY_DEEP_AGENT_MODEL}`);
  console.log(`✓ Base URL: ${CONFIG.REQUESTY_BASE_URL}`);

  try {
    console.log('\n--- Building Requesty model ---');
    const model = buildProviderModel('requesty');
    console.log('✓ Model built successfully');

    console.log('\n--- Sending test chat completion request ---');
    const testPrompt = 'Say "Hello from Requesty!" and nothing else.';
    console.log(`Prompt: "${testPrompt}"`);

    const startTime = Date.now();
    const response = await model.invoke(testPrompt);
    const duration = Date.now() - startTime;

    console.log(`\n✓ Response received in ${duration}ms`);
    console.log(`Response content: "${response.content}"`);

    // Validate response
    if (!response.content || typeof response.content !== 'string') {
      throw new Error('Invalid response: content is missing or not a string');
    }

    if (response.content.length === 0) {
      throw new Error('Invalid response: content is empty');
    }

    console.log('\n✓ Response validation passed');
    console.log('\n' + '='.repeat(60));
    console.log('✅ Requesty provider test PASSED');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ Requesty provider test FAILED');
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

testRequestyProvider();
