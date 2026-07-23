import { neon } from '@neondatabase/serverless';
// fetchConnectionCache is deprecated (now always true) — no longer needed.
/**
 * Thin wrapper around the Neon serverless driver exposing exactly the
 * durable-state operations the framework needs: run bookkeeping, todo
 * persistence, and an audit event log. All methods are safe to call
 * concurrently for a given prompt_hash from a single active process
 * (state corruption is avoided by having only one deep agent instance
 * "own" a given run at a time — see StateStore for the locking notes).
 */
export class DatabaseClient {
    sql;
    constructor(connectionString) {
        this.sql = neon(connectionString);
    }
    /**
     * Expose the raw neon SQL tagged-template function so callers can run
     * domain-specific queries (e.g. creating/querying their own tables)
     * using the same DB connection, without needing a separate client.
     *
     * Usage:
     * ```ts
     * const sql = db.getSql();
     * await sql`CREATE TABLE IF NOT EXISTS my_table (...)`;
     * const rows = await sql`SELECT * FROM my_table WHERE ...`;
     * ```
     */
    getSql() {
        return this.sql;
    }
    async getRun(promptHash) {
        const rows = (await this.sql `
      SELECT * FROM agent_runs WHERE prompt_hash = ${promptHash} LIMIT 1
    `);
        return rows[0] ?? null;
    }
    async createRun(promptHash, userPrompt, threadId, provider) {
        const rows = (await this.sql `
      INSERT INTO agent_runs (prompt_hash, user_prompt, status, current_provider, thread_id)
      VALUES (${promptHash}, ${userPrompt}, 'in_progress', ${provider}, ${threadId})
      ON CONFLICT (prompt_hash) DO NOTHING
      RETURNING *
    `);
        if (rows[0])
            return rows[0];
        // Row already existed (race) — fetch it.
        const existing = await this.getRun(promptHash);
        if (!existing)
            throw new Error(`Failed to create or fetch run for hash ${promptHash}`);
        return existing;
    }
    async updateRunStatus(promptHash, status, errorMessage) {
        await this.sql `
      UPDATE agent_runs
      SET status = ${status}, error_message = ${errorMessage ?? null}, updated_at = now()
      WHERE prompt_hash = ${promptHash}
    `;
    }
    async setCurrentProvider(promptHash, provider) {
        await this.sql `
      UPDATE agent_runs SET current_provider = ${provider}, updated_at = now()
      WHERE prompt_hash = ${promptHash}
    `;
    }
    async setFinalResult(promptHash, result) {
        await this.sql `
      UPDATE agent_runs
      SET final_result = ${result}, status = 'completed', updated_at = now()
      WHERE prompt_hash = ${promptHash}
    `;
    }
    async getTodos(promptHash) {
        const rows = (await this.sql `
      SELECT * FROM agent_todos WHERE prompt_hash = ${promptHash} ORDER BY todo_index ASC
    `);
        return rows;
    }
    /**
     * Overwrite the full todo list for a run (used when the deep agent
     * (re)creates its plan via write_todos). Existing rows for indices not
     * present are removed so the durable copy always mirrors the agent's
     * latest plan.
     */
    async replaceTodos(promptHash, todos) {
        await this.sql `DELETE FROM agent_todos WHERE prompt_hash = ${promptHash}`;
        for (let i = 0; i < todos.length; i++) {
            const todo = todos[i];
            await this.sql `
        INSERT INTO agent_todos (prompt_hash, todo_index, content, status)
        VALUES (${promptHash}, ${i}, ${todo.content}, ${todo.status})
      `;
        }
    }
    async updateTodoStatus(promptHash, todoIndex, status, resultNote) {
        await this.sql `
      UPDATE agent_todos
      SET status = ${status}, result_note = ${resultNote ?? null}, updated_at = now()
      WHERE prompt_hash = ${promptHash} AND todo_index = ${todoIndex}
    `;
    }
    /**
     * Reset a previously-failed run back to in_progress so it can be
     * retried from scratch (e.g. after fixing a config/model issue).
     */
    async resetFailedRun(promptHash, provider) {
        await this.sql `
      UPDATE agent_runs
      SET status = 'in_progress', current_provider = ${provider}, error_message = NULL, final_result = NULL, updated_at = now()
      WHERE prompt_hash = ${promptHash} AND status = 'failed'
    `;
        await this.sql `DELETE FROM agent_todos WHERE prompt_hash = ${promptHash}`;
    }
    async logEvent(promptHash, eventType, details) {
        await this.sql `
      INSERT INTO agent_events (prompt_hash, event_type, details)
      VALUES (${promptHash}, ${eventType}, ${JSON.stringify(details)})
    `;
    }
    // ---- LangGraph checkpoint persistence ----
    async getCheckpoint(threadId, checkpointId) {
        const result = (await this.sql `
      SELECT checkpoint, metadata, parent_checkpoint_id
      FROM checkpoints
      WHERE thread_id = ${threadId} AND checkpoint_id = ${checkpointId}
      LIMIT 1
    `);
        return result[0] ?? null;
    }
    async getLatestCheckpoint(threadId) {
        const result = (await this.sql `
      SELECT checkpoint, metadata, parent_checkpoint_id, checkpoint_id, checkpoint_ns
      FROM checkpoints
      WHERE thread_id = ${threadId}
      ORDER BY created_at DESC
      LIMIT 1
    `);
        return result[0] ?? null;
    }
    async saveCheckpoint(threadId, checkpointId, checkpoint, metadata, parentCheckpointId) {
        await this.sql `
      INSERT INTO checkpoints (thread_id, checkpoint_id, checkpoint, metadata, parent_checkpoint_id)
      VALUES (${threadId}, ${checkpointId}, ${JSON.stringify(checkpoint)}, ${JSON.stringify(metadata)}, ${parentCheckpointId ?? null})
      ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id)
      DO UPDATE SET checkpoint = ${JSON.stringify(checkpoint)}, metadata = ${JSON.stringify(metadata)}, parent_checkpoint_id = ${parentCheckpointId ?? null}
    `;
    }
    async listCheckpoints(threadId, limit) {
        const result = (await this.sql `
      SELECT * FROM checkpoints WHERE thread_id = ${threadId} ORDER BY created_at DESC LIMIT ${limit ?? 100}
    `);
        return result;
    }
    async saveCheckpointWrite(threadId, checkpointNs, checkpointId, taskId, idx, channel, value) {
        await this.sql `
      INSERT INTO checkpoint_writes (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, value)
      VALUES (${threadId}, ${checkpointNs}, ${checkpointId}, ${taskId}, ${idx}, ${channel}, ${JSON.stringify(value)})
      ON CONFLICT (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
      DO UPDATE SET channel = ${channel}, value = ${JSON.stringify(value)}
    `;
    }
    // ---- Generic caller-defined custom state (fine-grained sub-step checkpointing) ----
    /**
     * Fetch one caller-defined state value for a run, or null if never set.
     * `stateKey` is entirely caller-defined (e.g. "character:Pip:pose:front").
     */
    async getCustomState(promptHash, stateKey) {
        const rows = (await this.sql `
      SELECT value FROM agent_custom_state WHERE prompt_hash = ${promptHash} AND state_key = ${stateKey} LIMIT 1
    `);
        return rows[0] ? rows[0].value : null;
    }
    /**
     * Upsert one caller-defined state value for a run. Overwrites any
     * previous value under the same (prompt_hash, state_key).
     */
    async setCustomState(promptHash, stateKey, value) {
        await this.sql `
      INSERT INTO agent_custom_state (prompt_hash, state_key, value)
      VALUES (${promptHash}, ${stateKey}, ${JSON.stringify(value)})
      ON CONFLICT (prompt_hash, state_key)
      DO UPDATE SET value = ${JSON.stringify(value)}, updated_at = now()
    `;
    }
    /** Remove one caller-defined state entry (rarely needed; mostly for cleanup/tests). */
    async deleteCustomState(promptHash, stateKey) {
        await this.sql `DELETE FROM agent_custom_state WHERE prompt_hash = ${promptHash} AND state_key = ${stateKey}`;
    }
    /**
     * List all caller-defined state entries for a run, optionally filtered to
     * keys starting with `keyPrefix` (e.g. "character:Pip:" to fetch every
     * pose checkpoint for one character in one query).
     */
    async listCustomState(promptHash, keyPrefix) {
        const rows = keyPrefix
            ? (await this.sql `
          SELECT state_key, value FROM agent_custom_state
          WHERE prompt_hash = ${promptHash} AND state_key LIKE ${keyPrefix + "%"}
        `)
            : (await this.sql `
          SELECT state_key, value FROM agent_custom_state WHERE prompt_hash = ${promptHash}
        `);
        return rows.map((r) => ({ key: r.state_key, value: r.value }));
    }
}
//# sourceMappingURL=client.js.map