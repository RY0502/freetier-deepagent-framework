import { neon } from '@neondatabase/serverless';
import { CONFIG } from '../config.js';
import { SCHEMA_SQL } from './schema.js';
/**
 * One-time / idempotent DB bootstrap. Run with `npm run db:setup`.
 */
async function main() {
    if (!CONFIG.NEON_DATABASE_URL) {
        throw new Error('NEON_DATABASE_URL is not set');
    }
    const sql = neon(CONFIG.NEON_DATABASE_URL);
    const statements = SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) {
        await sql(statement);
    }
    console.log('Neon schema ready: agent_runs, agent_todos, agent_events, agent_custom_state');
}
main().catch((err) => {
    console.error('DB setup failed:', err);
    process.exit(1);
});
//# sourceMappingURL=setup.js.map