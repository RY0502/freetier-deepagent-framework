import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { NeonCheckpointSaver } from '../db/neonCheckpointer.js';
import { StateStore } from '../state/stateStore.js';
import { ProviderManager } from '../providers/providerManager.js';
import { classifyProviderError } from '../providers/errorClassifier.js';
import { createTavilySearchTool, createTavilyCrawlTool } from '../tools/tavilyTools.js';
import { createVisionScrapeTool, createPageAnalysisTool } from '../tools/visionScrapeTool.js';
import { buildDefaultSubagents } from './subagentFactory.js';
import { LoggingCallbackHandler } from '../callbacks/loggingCallbackHandler.js';
const logger = {
    info: (msg, meta) => console.log(`[deep-agent] ${msg}`, meta ?? ''),
    warn: (msg, meta) => console.warn(`[deep-agent] ${msg}`, meta ?? ''),
    error: (msg, meta) => console.error(`[deep-agent] ${msg}`, meta ?? ''),
};
const SYSTEM_PROMPT_TEMPLATE = (resumeNote, domainRules) => `You are a deep agent that plans and executes user tasks end to end.

## Current date
Today's date is ${new Date().toISOString().slice(0, 10)}. Use this as ground truth when judging whether content is "latest"/"current"/"today's"/"breaking" — a search result or crawled page whose publish date is not today (or within the requested window) is STALE, even if it looks complete or authoritative. Never assume your training data reflects the current date.

## Planning
Immediately call the \`write_todos\` tool to create/update your plan before doing any other work. Keep it updated as you make progress: mark each item "in_progress" when you start it and "completed" as soon as it is done, adding a brief result note.

${resumeNote}

## Tools
- tavily_search / tavily_crawl: internet search and page text extraction. NOTE: Tavily's index can be cached/stale — fine for blogs, articles, tutorials, documentation, past events; do NOT trust it for real-time facts or breaking/latest/today's news. For tavily_search, set \`topic: 'news'\` and \`days\` (e.g. days=1 for "today") to bias results toward recent publish dates when the task is time-sensitive.
- vision_scrape: extract specific DATA values off a rendered page/screenshot (charts, dashboards, JS-heavy sites, or a real-time value/today's headline you need to read live) via a remote vision model.
- analyze_page_components: describe a page/screenshot's UI/layout/components (design-review style questions) — NOT for extracting data values, use vision_scrape for that.
- Delegate independent, parallelizable sub-tasks to sub-agents instead of doing everything yourself:
  - research-subagent: non-time-sensitive research (blogs, articles, tutorials, history).
  - vision-subagent: screenshot/UI data-extraction or component-analysis tasks.
  - live-data-subagent: real-time/live facts OR breaking/latest/today's news of ANY topic (scores, prices, weather/AQI, headlines, etc.) — it searches with recency bias then reads/confirms the live value directly off the rendered page, bypassing stale search-index snippets.
- Use your built-in filesystem tools (read/write/ls) and PDF-generation capability whenever the task calls for producing files.
- Additional tools/sub-agents may be supplied by the caller for domain-specific capabilities (e.g. stock-trading data, image generation) — treat them the same as the built-ins above, per their own descriptions.

## Rules
1. Never skip the todo list — it is the durable record of your progress and is what a *different* underlying model/provider will use to resume this exact task if the current one runs out of free-tier quota.
2. Do not repeat already-completed todo items.
3. If a tool call fails transiently, retry once before giving up on that step.
4. When all todos are completed, give a clear final answer summarizing the outcome.
5. If the task says "today", "latest", "current", "breaking", "now", or similar — regardless of topic (news, prices, scores, weather, etc.) — delegate to \`live-data-subagent\`, never \`research-subagent\`. Verify the publish/update date against today's date before presenting any result as current.
${domainRules ? `\n## Domain rules\n${domainRules}` : ''}`;
/**
 * Orchestrates a single user task end-to-end:
 * 1. Hash the prompt -> load or create durable run/todo state (Neon).
 * 2. Build a deep agent using the current provider's GLM model.
 * 3. Stream execution, persisting todo updates to Neon as they occur.
 * 4. On quota exhaustion, switch to the next provider and rebuild the
 *    deep agent with the *same* thread_id/backend/checkpointer so the
 *    new provider resumes from the exact last-completed todo.
 * 5. Repeat until success, or until all providers are exhausted.
 */
export class DeepAgentRunner {
    stateStore;
    checkpointer;
    backend;
    extraTools;
    extraSubagents;
    systemPromptExtension;
    callbacks;
    /**
     * @param options.extraTools Additional tools merged with the
     *   framework's built-in tools (tavily_search/crawl, vision_scrape,
     *   analyze_page_components) — e.g. a domain-specific API client tool
     *   for a specialized caller (stock-trading data, image-gen, etc.).
     * @param options.extraSubagents Additional `SubagentDef`s merged with
     *   the built-in research/vision/live-data sub-agents. Useful for
     *   giving a specialized caller its own parallelizable sub-agent
     *   without having to fork this framework.
     */
    constructor(db, options = {}) {
        this.stateStore = new StateStore(db);
        this.checkpointer = new NeonCheckpointSaver(db);
        this.backend = new FilesystemBackend();
        this.extraTools = options.extraTools ?? [];
        this.extraSubagents = options.extraSubagents ?? [];
        this.systemPromptExtension = options.systemPromptExtension;
        this.callbacks = [new LoggingCallbackHandler(), ...(options.callbacks ?? [])];
    }
    async run(userPrompt) {
        const initialProvider = 'nvidia';
        const runState = await this.stateStore.loadOrCreate(userPrompt, initialProvider);
        const providerManager = new ProviderManager(runState.currentProvider);
        logger.info(runState.isNew ? 'Starting new task' : 'Resuming existing task', {
            promptHash: runState.promptHash,
            threadId: runState.threadId,
            provider: providerManager.current,
            existingTodos: runState.todos.length,
        });
        let lastKnownTodos = runState.todos;
        let attemptCount = 0;
        while (true) {
            attemptCount++;
            try {
                logger.info('Attempt starting', { promptHash: runState.promptHash, attempt: attemptCount, provider: providerManager.current, todoCount: lastKnownTodos.length });
                const finalText = await this.executeWithProvider(userPrompt, runState.promptHash, runState.threadId, providerManager, lastKnownTodos);
                await this.stateStore.complete(runState.promptHash, finalText);
                logger.info('Task completed', { promptHash: runState.promptHash, provider: providerManager.current, finalTextLength: finalText.length });
                return { promptHash: runState.promptHash, finalText, providerUsed: providerManager.current };
            }
            catch (error) {
                const kind = classifyProviderError(error);
                const message = error instanceof Error ? error.message : String(error);
                logger.error('Attempt failed', { promptHash: runState.promptHash, attempt: attemptCount, provider: providerManager.current, kind, message: message.slice(0, 200) });
                if (kind === 'quota') {
                    const from = providerManager.current;
                    const next = providerManager.switchToNext();
                    if (!next) {
                        logger.error('All providers exhausted', { promptHash: runState.promptHash, lastError: message });
                        await this.stateStore.fail(runState.promptHash, `All providers exhausted. Last error: ${message}`);
                        throw new Error(`All providers exhausted for task ${runState.promptHash}. Last error: ${message}`);
                    }
                    await this.stateStore.recordProviderSwitch(runState.promptHash, from, next, message);
                    logger.warn('Provider quota exhausted — switching provider', { promptHash: runState.promptHash, from, to: next, reason: message.slice(0, 150) });
                    // Refresh known todos from durable store before retrying with the new provider,
                    // in case the failure happened mid-write.
                    lastKnownTodos = (await this.stateStore.loadOrCreate(userPrompt, next)).todos;
                    continue;
                }
                // Fatal or exhausted-retryable error: mark failed and bubble up.
                logger.error('Task failed fatally', { promptHash: runState.promptHash, kind, message: message.slice(0, 200) });
                await this.stateStore.fail(runState.promptHash, message);
                throw error;
            }
        }
    }
    async executeWithProvider(userPrompt, promptHash, threadId, providerManager, existingTodos) {
        const resumeNote = existingTodos.length > 0
            ? `## Resuming a prior run\nThis task was previously in progress under a different provider. The durably persisted todo list so far is:\n${existingTodos
                .map((t, i) => `${i + 1}. [${t.status}] ${t.content}`)
                .join('\n')}\nDo NOT redo items marked "completed" — call write_todos to restate this exact list, then continue with the first "pending"/"in_progress" item.`
            : '';
        logger.info('Creating deep agent', { provider: providerManager.current, threadId });
        const agentWithPrompt = createDeepAgent({
            model: providerManager.getModel(),
            systemPrompt: SYSTEM_PROMPT_TEMPLATE(resumeNote, this.systemPromptExtension),
            tools: [
                createTavilySearchTool(),
                createTavilyCrawlTool(),
                createVisionScrapeTool(),
                createPageAnalysisTool(),
                ...this.extraTools,
            ],
            subagents: [...buildDefaultSubagents(this.callbacks), ...this.extraSubagents],
            backend: this.backend,
            checkpointer: this.checkpointer,
        });
        const userMessage = existingTodos.length > 0
            ? `Resume this task exactly where it left off: ${userPrompt}`
            : userPrompt;
        logger.info('Starting agent stream', { provider: providerManager.current, threadId, messageLength: userMessage.length });
        const stream = await agentWithPrompt.stream({ messages: [{ role: 'user', content: userMessage }] }, { configurable: { thread_id: threadId }, recursionLimit: 100, callbacks: this.callbacks });
        let lastTodosSeen = existingTodos;
        let finalMessageText = '';
        let chunkCount = 0;
        for await (const chunk of stream) {
            chunkCount++;
            const state = this.extractState(chunk);
            if (state?.todos) {
                const todos = state.todos.map((t) => ({ content: t.content ?? String(t), status: t.status ?? 'pending' }));
                if (JSON.stringify(todos) !== JSON.stringify(lastTodosSeen)) {
                    logger.info('Todos updated', { promptHash, count: todos.length, todos: todos.map(t => `[${t.status}] ${t.content}`) });
                    await this.stateStore.persistTodos(promptHash, todos);
                    for (let i = 0; i < todos.length; i++) {
                        const prev = lastTodosSeen[i];
                        if (todos[i].status === 'completed' && prev?.status !== 'completed') {
                            await this.stateStore.markTodoCompleted(promptHash, i, todos[i].content);
                            logger.info('Todo completed', { promptHash, index: i, content: todos[i].content });
                        }
                    }
                    lastTodosSeen = todos;
                }
            }
            if (state?.messages?.length) {
                const last = state.messages[state.messages.length - 1];
                if (typeof last?.content === 'string') {
                    finalMessageText = last.content;
                }
            }
        }
        logger.info('Stream completed', { promptHash, totalChunks: chunkCount, finalTextLength: finalMessageText.length });
        return finalMessageText || 'Task completed with no final text output.';
    }
    /** Normalizes the varying shapes a LangGraph stream chunk can take. */
    extractState(chunk) {
        if (!chunk || typeof chunk !== 'object')
            return null;
        const values = Object.values(chunk);
        for (const value of values) {
            if (value && typeof value === 'object' && ('todos' in value || 'messages' in value)) {
                return value;
            }
        }
        if ('todos' in chunk || 'messages' in chunk) {
            return chunk;
        }
        return null;
    }
}
//# sourceMappingURL=deepAgentRunner.js.map