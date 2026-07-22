import { DatabaseClient } from '../db/client.js';
import type { TodoStatus } from '../db/schema.js';
export interface TodoSnapshot {
    content: string;
    status: TodoStatus;
}
export interface RunState {
    promptHash: string;
    userPrompt: string;
    threadId: string;
    isNew: boolean;
    currentProvider: string;
    todos: TodoSnapshot[];
}
/**
 * Durable state façade used by the runner. Responsible for:
 * - Hashing the incoming prompt to a stable run id.
 * - Loading existing progress (todos + provider) if the run already
 *   exists, or bootstrapping a brand-new run otherwise.
 * - Persisting todo/provider changes as the deep agent makes progress.
 *
 * Note on concurrency/state-corruption: a given prompt_hash is only ever
 * "driven" by one active DeepAgentRunner instance at a time (the CLI/
 * server enforces this), so writes here are effectively single-writer.
 * Parallel sub-agents do NOT write to this store directly — they return
 * results to the main deep agent, which is the sole writer of todo state.
 */
export declare class StateStore {
    private readonly db;
    constructor(db: DatabaseClient);
    loadOrCreate(userPrompt: string, initialProvider: string): Promise<RunState>;
    persistTodos(promptHash: string, todos: TodoSnapshot[]): Promise<void>;
    markTodoCompleted(promptHash: string, todoIndex: number, resultNote?: string): Promise<void>;
    recordProviderSwitch(promptHash: string, fromProvider: string, toProvider: string, reason: string): Promise<void>;
    complete(promptHash: string, finalResult: string): Promise<void>;
    fail(promptHash: string, errorMessage: string): Promise<void>;
}
