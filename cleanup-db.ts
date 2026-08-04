import { neon } from '@neondatabase/serverless';
import 'dotenv/config';

const sql = neon(process.env.NEON_DATABASE_URL!);
const selectiveMode = process.argv.includes('--selective');

async function cleanupDatabase() {
  try {
    console.log(`Starting ${selectiveMode ? 'selective ' : ''}database cleanup...\n`);

    // Delete all checkpoint writes
    console.log('Deleting checkpoint writes...');
    await sql`DELETE FROM checkpoint_writes`;
    console.log('  ✓ Deleted checkpoint write records\n');

    // Delete all checkpoints
    console.log('Deleting checkpoints...');
    await sql`DELETE FROM checkpoints`;
    console.log('  ✓ Deleted checkpoint records\n');

    // Delete all agent events
    console.log('Deleting agent events...');
    await sql`DELETE FROM agent_events`;
    console.log('  ✓ Deleted event records\n');

    // Delete all agent todos
    console.log('Deleting agent todos...');
    await sql`DELETE FROM agent_todos`;
    console.log('  ✓ Deleted todo records\n');

    if (!selectiveMode) {
      console.log('Deleting agent custom state...');
      await sql`DELETE FROM agent_custom_state`;
      console.log('  ✓ Deleted custom state records\n');

      console.log('Deleting agent runs...');
      await sql`DELETE FROM agent_runs`;
      console.log('  ✓ Deleted run records\n');
    }

    console.log('✓ Database cleanup complete!');
    console.log(`\n${selectiveMode ? 'Selective cleanup removed transient agent data:' : 'All agent data has been cleared:'}`);
    if (!selectiveMode) {
      console.log('  - Agent runs');
      console.log('  - Agent custom state');
    }
    console.log('  - Agent todos');
    console.log('  - Agent events');
    console.log('  - LangGraph checkpoints');
    console.log('  - LangGraph checkpoint writes');
    if (selectiveMode) {
      console.log('\nPreserved: agent_runs, agent_custom_state');
    } else {
      console.log('\nYou can now start fresh with new agent runs.');
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupDatabase();
