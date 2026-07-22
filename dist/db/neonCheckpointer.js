import { BaseCheckpointSaver } from '@langchain/langgraph';
/**
 * LangGraph checkpoint saver backed by Neon Postgres. Provides the deep
 * agent's short-term (in-graph) state persistence, complementing the
 * StateStore's higher-level todo/provider durable state. Ported from the
 * existing deep-agent repo's Neon checkpointer pattern.
 */
export class NeonCheckpointSaver extends BaseCheckpointSaver {
    db;
    constructor(db) {
        super();
        this.db = db;
    }
    async putWrites(config, writes, taskId) {
        const threadId = config.configurable?.thread_id;
        const checkpointNs = config.configurable?.checkpoint_ns || '';
        const checkpointId = config.configurable?.checkpoint_id;
        if (!threadId || !checkpointId)
            throw new Error('thread_id and checkpoint_id are required');
        for (let idx = 0; idx < writes.length; idx++) {
            const [channel, value] = writes[idx];
            await this.db.saveCheckpointWrite(threadId, checkpointNs, checkpointId, taskId, idx, channel, value);
        }
    }
    async getTuple(config) {
        const threadId = config.configurable?.thread_id;
        const checkpointNs = config.configurable?.checkpoint_ns || '';
        const checkpointId = config.configurable?.checkpoint_id;
        if (!threadId)
            return undefined;
        const result = checkpointId
            ? await this.db.getCheckpoint(threadId, checkpointId)
            : await this.db.getLatestCheckpoint(threadId);
        if (!result)
            return undefined;
        return {
            config,
            checkpoint: result.checkpoint,
            metadata: result.metadata,
            parentConfig: result.parent_checkpoint_id
                ? { configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: result.parent_checkpoint_id } }
                : undefined,
        };
    }
    async *list(config, options) {
        const threadId = config.configurable?.thread_id;
        if (!threadId)
            return;
        const checkpoints = await this.db.listCheckpoints(threadId, options?.limit);
        for (const cp of checkpoints) {
            yield {
                config: { configurable: { thread_id: threadId, checkpoint_ns: cp.checkpoint_ns || '', checkpoint_id: cp.checkpoint_id } },
                checkpoint: cp.checkpoint,
                metadata: cp.metadata,
                parentConfig: cp.parent_checkpoint_id
                    ? { configurable: { thread_id: threadId, checkpoint_ns: cp.checkpoint_ns || '', checkpoint_id: cp.parent_checkpoint_id } }
                    : undefined,
            };
        }
    }
    async put(config, checkpoint, metadata) {
        const threadId = config.configurable?.thread_id;
        const checkpointNs = config.configurable?.checkpoint_ns || '';
        const checkpointId = checkpoint.id;
        const parentCheckpointId = config.configurable?.checkpoint_id;
        if (!threadId || !checkpointId)
            throw new Error('thread_id and checkpoint_id are required');
        await this.db.saveCheckpoint(threadId, checkpointId, checkpoint, metadata, parentCheckpointId);
        return { configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: checkpointId } };
    }
    async deleteThread(_threadId) {
        return;
    }
}
//# sourceMappingURL=neonCheckpointer.js.map