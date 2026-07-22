import { CONFIG, validateConfig } from './config.js';
import { DatabaseClient } from './db/client.js';
import { DeepAgentRunner } from './agents/deepAgentRunner.js';
import { buildDefaultSubagents, buildResearchSubagent, buildVisionSubagent, buildLiveDataSubagent } from './agents/subagentFactory.js';
/**
 * Library entry point for callers embedding this framework (e.g. a
 * specialized orchestrator wrapping `DeepAgentRunner` for its own
 * domain — see README "Using as a library"). Re-exported here so
 * consumers only need to `import { DeepAgentRunner, ... } from
 * 'freetier-deepagent-framework'` rather than reaching into `src/`.
 */
export { DatabaseClient, DeepAgentRunner, buildDefaultSubagents, buildResearchSubagent, buildVisionSubagent, buildLiveDataSubagent, validateConfig, CONFIG };
async function main() {
    const userPrompt = process.argv.slice(2).join(' ').trim();
    if (!userPrompt) {
        console.error('Usage: npm run dev -- "<your task prompt>"');
        process.exit(1);
    }
    validateConfig();
    const db = new DatabaseClient(CONFIG.NEON_DATABASE_URL);
    const runner = new DeepAgentRunner(db);
    console.log('='.repeat(60));
    console.log('Free-Tier Deep Agent Framework');
    console.log('='.repeat(60));
    console.log(`Prompt: ${userPrompt}\n`);
    try {
        const result = await runner.run(userPrompt);
        console.log('\n--- FINAL RESULT ---');
        console.log(result.finalText);
        console.log(`\n(provider used: ${result.providerUsed}, run id: ${result.promptHash})`);
    }
    catch (error) {
        console.error('\nTask failed:', error);
        process.exit(1);
    }
}
// Only run the CLI entry point when this file is executed directly
// (e.g. `npm run dev -- "..."` or `node dist/index.js`), not when it is
// imported as a library by another package (e.g.
// `import { DeepAgentRunner } from 'freetier-deepagent-framework'`).
const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
    main();
}
//# sourceMappingURL=index.js.map