import { DatabaseClient } from '../db/client.js';
/**
 * Ergonomic façade over `DatabaseClient`'s generic custom-state table for
 * callers (e.g. a downstream video-generation pipeline) that need to persist
 * their own fine-grained sub-step checkpoints -- beyond the framework's
 * built-in todo/provider state -- keyed by the *same* prompt-hash convention
 * the framework already uses for `agent_runs`/`DeepAgentRunner`.
 *
 * This lets a caller re-run the identical prompt after a crash/rate-limit
 * and resume from the exact sub-step it last completed (e.g. "character
 * Pip's 3rd pose" or "scene 3's narration audio"), not just the last
 * completed top-level todo.
 *
 * Usage:
 * ```ts
 * const customState = new CustomStateStore(db);
 * const promptHash = customState.hashPrompt(userPrompt);
 * const done = await customState.get(promptHash, "character:Pip:pose:front");
 * if (!done) {
 *   // ...do the work...
 *   await customState.set(promptHash, "character:Pip:pose:front", { path, rationale });
 * }
 * ```
 */
export declare class CustomStateStore {
    private readonly db;
    constructor(db: DatabaseClient);
    /**
     * Deterministically derive the same prompt_hash the framework's
     * `DeepAgentRunner`/`StateStore` uses for a given user prompt, so caller
     * checkpoints line up with the same run.
     */
    hashPrompt(userPrompt: string): string;
    get<T = unknown>(promptHash: string, key: string): Promise<T | null>;
    set(promptHash: string, key: string, value: unknown): Promise<void>;
    delete(promptHash: string, key: string): Promise<void>;
    /** List every checkpoint for a run, optionally filtered by key prefix. */
    list<T = unknown>(promptHash: string, keyPrefix?: string): Promise<Array<{
        key: string;
        value: T;
    }>>;
    /**
     * Convenience: has this exact sub-step already been completed?
     * Equivalent to `(await get(promptHash, key)) !== null`.
     */
    isDone(promptHash: string, key: string): Promise<boolean>;
}
