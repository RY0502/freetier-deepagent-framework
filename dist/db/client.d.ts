import { neon } from '@neondatabase/serverless';
import type { AgentRunRow, AgentTodoRow, RunStatus, TodoStatus } from './schema.js';
/**
 * Thin wrapper around the Neon serverless driver exposing exactly the
 * durable-state operations the framework needs: run bookkeeping, todo
 * persistence, and an audit event log. All methods are safe to call
 * concurrently for a given prompt_hash from a single active process
 * (state corruption is avoided by having only one deep agent instance
 * "own" a given run at a time — see StateStore for the locking notes).
 */
export declare class DatabaseClient {
    private sql;
    constructor(connectionString: string);
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
    getSql(): ReturnType<typeof neon>;
    getRun(promptHash: string): Promise<AgentRunRow | null>;
    createRun(promptHash: string, userPrompt: string, threadId: string, provider: string): Promise<AgentRunRow>;
    updateRunStatus(promptHash: string, status: RunStatus, errorMessage?: string): Promise<void>;
    setCurrentProvider(promptHash: string, provider: string): Promise<void>;
    setFinalResult(promptHash: string, result: string): Promise<void>;
    getTodos(promptHash: string): Promise<AgentTodoRow[]>;
    /**
     * Overwrite the full todo list for a run (used when the deep agent
     * (re)creates its plan via write_todos). Existing rows for indices not
     * present are removed so the durable copy always mirrors the agent's
     * latest plan.
     */
    replaceTodos(promptHash: string, todos: Array<{
        content: string;
        status: TodoStatus;
    }>): Promise<void>;
    updateTodoStatus(promptHash: string, todoIndex: number, status: TodoStatus, resultNote?: string): Promise<void>;
    /**
     * Reset a previously-failed run back to in_progress so it can be
     * retried from scratch (e.g. after fixing a config/model issue).
     */
    resetFailedRun(promptHash: string, provider: string): Promise<void>;
    logEvent(promptHash: string, eventType: string, details: Record<string, unknown>): Promise<void>;
    getCheckpoint(threadId: string, checkpointId: string): Promise<any>;
    getLatestCheckpoint(threadId: string): Promise<any>;
    saveCheckpoint(threadId: string, checkpointId: string, checkpoint: any, metadata: any, parentCheckpointId?: string): Promise<void>;
    listCheckpoints(threadId: string, limit?: number): Promise<any[]>;
    saveCheckpointWrite(threadId: string, checkpointNs: string, checkpointId: string, taskId: string, idx: number, channel: string, value: any): Promise<void>;
    /**
     * Fetch one caller-defined state value for a run, or null if never set.
     * `stateKey` is entirely caller-defined (e.g. "character:Pip:pose:front").
     */
    getCustomState<T = unknown>(promptHash: string, stateKey: string): Promise<T | null>;
    /**
     * Upsert one caller-defined state value for a run. Overwrites any
     * previous value under the same (prompt_hash, state_key).
     */
    setCustomState(promptHash: string, stateKey: string, value: unknown): Promise<void>;
    /** Remove one caller-defined state entry (rarely needed; mostly for cleanup/tests). */
    deleteCustomState(promptHash: string, stateKey: string): Promise<void>;
    /**
     * List all caller-defined state entries for a run, optionally filtered to
     * keys starting with `keyPrefix` (e.g. "character:Pip:" to fetch every
     * pose checkpoint for one character in one query).
     */
    listCustomState<T = unknown>(promptHash: string, keyPrefix?: string): Promise<Array<{
        key: string;
        value: T;
    }>>;
}
