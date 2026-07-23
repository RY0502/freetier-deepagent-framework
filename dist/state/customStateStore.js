import { hashUserPrompt } from './promptHash.js';
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
export class CustomStateStore {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Deterministically derive the same prompt_hash the framework's
     * `DeepAgentRunner`/`StateStore` uses for a given user prompt, so caller
     * checkpoints line up with the same run.
     */
    hashPrompt(userPrompt) {
        return hashUserPrompt(userPrompt);
    }
    async get(promptHash, key) {
        return this.db.getCustomState(promptHash, key);
    }
    async set(promptHash, key, value) {
        await this.db.setCustomState(promptHash, key, value);
    }
    async delete(promptHash, key) {
        await this.db.deleteCustomState(promptHash, key);
    }
    /** List every checkpoint for a run, optionally filtered by key prefix. */
    async list(promptHash, keyPrefix) {
        return this.db.listCustomState(promptHash, keyPrefix);
    }
    /**
     * Convenience: has this exact sub-step already been completed?
     * Equivalent to `(await get(promptHash, key)) !== null`.
     */
    async isDone(promptHash, key) {
        const value = await this.get(promptHash, key);
        return value !== null;
    }
}
//# sourceMappingURL=customStateStore.js.map