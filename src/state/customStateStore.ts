import { DatabaseClient } from '../db/client.js';
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
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Deterministically derive the same prompt_hash the framework's
   * `DeepAgentRunner`/`StateStore` uses for a given user prompt, so caller
   * checkpoints line up with the same run.
   */
  hashPrompt(userPrompt: string): string {
    return hashUserPrompt(userPrompt);
  }

  async get<T = unknown>(promptHash: string, key: string): Promise<T | null> {
    return this.db.getCustomState<T>(promptHash, key);
  }

  async set(promptHash: string, key: string, value: unknown): Promise<void> {
    await this.db.setCustomState(promptHash, key, value);
  }

  async delete(promptHash: string, key: string): Promise<void> {
    await this.db.deleteCustomState(promptHash, key);
  }

  /** List every checkpoint for a run, optionally filtered by key prefix. */
  async list<T = unknown>(promptHash: string, keyPrefix?: string): Promise<Array<{ key: string; value: T }>> {
    return this.db.listCustomState<T>(promptHash, keyPrefix);
  }

  /**
   * Convenience: has this exact sub-step already been completed?
   * Equivalent to `(await get(promptHash, key)) !== null`.
   */
  async isDone(promptHash: string, key: string): Promise<boolean> {
    const value = await this.get(promptHash, key);
    return value !== null;
  }
}
