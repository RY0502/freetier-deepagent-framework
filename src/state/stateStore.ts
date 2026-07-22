import { DatabaseClient } from '../db/client.js';
import type { TodoStatus } from '../db/schema.js';
import { hashUserPrompt } from './promptHash.js';

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
export class StateStore {
  constructor(private readonly db: DatabaseClient) {}

  async loadOrCreate(userPrompt: string, initialProvider: string): Promise<RunState> {
    const promptHash = hashUserPrompt(userPrompt);
    const existing = await this.db.getRun(promptHash);

    if (existing) {
      // If a previous attempt failed (e.g. bad config/model), reset it
      // so we start fresh with a clean todo list and provider state.
      if (existing.status === 'failed') {
        console.log(`[StateStore] Resetting failed run ${promptHash} to provider ${initialProvider}`);
        await this.db.resetFailedRun(promptHash, initialProvider);
        await this.db.logEvent(promptHash, 'run_reset', { previousStatus: 'failed', provider: initialProvider });
        console.log(`[StateStore] Reset complete for ${promptHash}`);
        return {
          promptHash,
          userPrompt,
          threadId: existing.thread_id,
          isNew: true,
          currentProvider: initialProvider,
          todos: [],
        };
      }

      const todoRows = await this.db.getTodos(promptHash);
      await this.db.logEvent(promptHash, 'run_started', { resumed: true, provider: existing.current_provider });
      return {
        promptHash,
        userPrompt,
        threadId: existing.thread_id,
        isNew: false,
        currentProvider: existing.current_provider ?? initialProvider,
        todos: todoRows.map((row) => ({ content: row.content, status: row.status })),
      };
    }

    const threadId = `run-${promptHash.slice(0, 16)}`;
    await this.db.createRun(promptHash, userPrompt, threadId, initialProvider);
    await this.db.logEvent(promptHash, 'run_started', { resumed: false, provider: initialProvider });
    return {
      promptHash,
      userPrompt,
      threadId,
      isNew: true,
      currentProvider: initialProvider,
      todos: [],
    };
  }

  async persistTodos(promptHash: string, todos: TodoSnapshot[]): Promise<void> {
    await this.db.replaceTodos(promptHash, todos);
  }

  async markTodoCompleted(promptHash: string, todoIndex: number, resultNote?: string): Promise<void> {
    await this.db.updateTodoStatus(promptHash, todoIndex, 'completed', resultNote);
    await this.db.logEvent(promptHash, 'todo_completed', { todoIndex, resultNote });
  }

  async recordProviderSwitch(promptHash: string, fromProvider: string, toProvider: string, reason: string): Promise<void> {
    await this.db.setCurrentProvider(promptHash, toProvider);
    await this.db.logEvent(promptHash, 'provider_switch', { fromProvider, toProvider, reason });
  }

  async complete(promptHash: string, finalResult: string): Promise<void> {
    await this.db.setFinalResult(promptHash, finalResult);
    await this.db.logEvent(promptHash, 'run_completed', {});
  }

  async fail(promptHash: string, errorMessage: string): Promise<void> {
    await this.db.updateRunStatus(promptHash, 'failed', errorMessage);
    await this.db.logEvent(promptHash, 'error', { errorMessage });
  }
}
