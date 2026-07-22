import { BaseCheckpointSaver } from '@langchain/langgraph';
import type { Checkpoint, CheckpointMetadata, CheckpointTuple } from '@langchain/langgraph';
import type { RunnableConfig } from '@langchain/core/runnables';
import { DatabaseClient } from './client.js';
type PendingWrite = [string, any];
/**
 * LangGraph checkpoint saver backed by Neon Postgres. Provides the deep
 * agent's short-term (in-graph) state persistence, complementing the
 * StateStore's higher-level todo/provider durable state. Ported from the
 * existing deep-agent repo's Neon checkpointer pattern.
 */
export declare class NeonCheckpointSaver extends BaseCheckpointSaver {
    private readonly db;
    constructor(db: DatabaseClient);
    putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void>;
    getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined>;
    list(config: RunnableConfig, options?: {
        limit?: number;
    }): AsyncGenerator<CheckpointTuple>;
    put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata): Promise<RunnableConfig>;
    deleteThread(_threadId: string): Promise<void>;
}
export {};
