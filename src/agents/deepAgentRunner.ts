import { createDeepAgent, FilesystemBackend } from 'deepagents';
import { DatabaseClient } from '../db/client.js';
import { NeonCheckpointSaver } from '../db/neonCheckpointer.js';
import { StateStore, type TodoSnapshot } from '../state/stateStore.js';
import { ProviderManager, type ProviderName } from '../providers/providerManager.js';
import { classifyProviderError } from '../providers/errorClassifier.js';
import { DynamicStructuredTool } from '@langchain/core/tools';
import type { BaseLanguageModel } from '@langchain/core/language_models/base';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { createTavilySearchTool, createTavilyCrawlTool } from '../tools/tavilyTools.js';
import { createVisionScrapeTool, createPageAnalysisTool } from '../tools/visionScrapeTool.js';
import { createPollinationsImageTool } from '../tools/pollinationsImageTool.js';
import { createCloudflareImg2ImgTool } from '../tools/cloudflareImg2ImgTool.js';
import { buildDefaultSubagents, type SubagentDef } from './subagentFactory.js';
import { LoggingCallbackHandler } from '../callbacks/loggingCallbackHandler.js';
import { CONFIG } from '../config.js';

/**
 * Extension points for callers embedding this framework (e.g. a
 * specialized agent wrapping `DeepAgentRunner` for its own domain).
 * Extra tools/sub-agents are merged with the framework's built-in
 * defaults rather than replacing them, so callers only need to supply
 * what's beyond the built-ins.
 */
export interface DeepAgentRunnerOptions {
  extraTools?: DynamicStructuredTool[];
  extraSubagents?: SubagentDef[];
  /**
   * Domain-specific policy/rules appended to the framework's base
   * system prompt as a "## Domain rules" section (e.g. "never place a
   * trade without explicit confirmation"). Does not replace the
   * framework's planning/tool-disambiguation rules — layered on top.
   */
  systemPromptExtension?: string;
  /**
   * LangChain callback handlers (e.g. a metrics/cost-tracking sink)
   * attached to every agent run. Receives standard LangChain
   * lifecycle events (on_llm_*, on_tool_*, on_chain_*) for per-call
   * latency/token/cost observability, distinct from the coarse
   * provider-switch audit log in `agent_events`.
   */
  callbacks?: BaseCallbackHandler[];
  /**
   * Caller-supplied LLM model (e.g. `ChatCerebras`, `ChatOpenAI`).
   * When provided, the framework uses this model directly instead of
   * the built-in NVIDIA → OpenRouter → HuggingFace provider rotation.
   * Provider-switch / quota-exhaustion logic is skipped — the caller
   * is responsible for their own model's availability and retries.
   * Useful for projects that already have a preferred LLM provider.
   */
  model?: BaseLanguageModel;
}

const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => console.log(`[deep-agent-orchestrator] ${msg}`, meta ?? ''),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(`[deep-agent-orchestrator] ${msg}`, meta ?? ''),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(`[deep-agent-orchestrator] ${msg}`, meta ?? ''),
};

const SYSTEM_PROMPT_TEMPLATE = (resumeNote: string, domainRules?: string) => `You are a deep agent that plans and executes user tasks end to end.

## Current date
Today's date is ${new Date().toISOString().slice(0, 10)}. Use this as ground truth when judging whether content is "latest"/"current"/"today's"/"breaking" — a search result or crawled page whose publish date is not today (or within the requested window) is STALE, even if it looks complete or authoritative. Never assume your training data reflects the current date.

## Planning
Immediately call the \`write_todos\` tool to create/update your plan before doing any other work. Keep it updated as you make progress: mark each item "in_progress" when you start it and "completed" as soon as it is done, adding a brief result note.

${resumeNote}

## Tools
- tavily_search / tavily_crawl: internet search and page text extraction. NOTE: Tavily's index can be cached/stale — fine for blogs, articles, tutorials, documentation, past events; do NOT trust it for real-time facts or breaking/latest/today's news. For tavily_search, set \`topic: 'news'\` and \`days\` (e.g. days=1 for "today") to bias results toward recent publish dates when the task is time-sensitive.
- vision_scrape: extract specific DATA values off a rendered page/screenshot (charts, dashboards, JS-heavy sites, or a real-time value/today's headline you need to read live) via a remote vision model.
- analyze_page_components: describe a page/screenshot's UI/layout/components (design-review style questions) — NOT for extracting data values, use vision_scrape for that.
- generate_image_pollinations: generate a brand-new image from a TEXT PROMPT ONLY (no reference image) via the Pollinations AI text-to-image API. Requires a model name (e.g. "flux", "gptimage", "zimage") and a prompt.
- generate_image_cloudflare_img2img: transform/edit an EXISTING reference image (base64) via Cloudflare Workers AI Stable Diffusion img2img, guided by a text prompt — use this instead of generate_image_pollinations when you need to preserve the visual identity of a reference image while changing its pose/scene/background.
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

export interface RunResult {
  promptHash: string;
  finalText: string;
  providerUsed: ProviderName | 'custom';
}

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
  private readonly stateStore: StateStore;
  private readonly checkpointer: NeonCheckpointSaver;
  private readonly backend: FilesystemBackend;
  private readonly extraTools: DynamicStructuredTool[];
  private readonly extraSubagents: SubagentDef[];
  private readonly systemPromptExtension?: string;
  private readonly callbacks: BaseCallbackHandler[];
  private readonly customModel?: BaseLanguageModel;

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
  constructor(db: DatabaseClient, options: DeepAgentRunnerOptions = {}) {
    this.stateStore = new StateStore(db);
    this.checkpointer = new NeonCheckpointSaver(db);
    this.backend = new FilesystemBackend();
    this.extraTools = options.extraTools ?? [];
    this.extraSubagents = options.extraSubagents ?? [];
    this.systemPromptExtension = options.systemPromptExtension;
    this.callbacks = [new LoggingCallbackHandler(), ...(options.callbacks ?? [])];
    this.customModel = options.model;
  }

  async run(userPrompt: string): Promise<RunResult> {
    // When a custom model is supplied, skip the built-in provider
    // rotation entirely — the caller manages their own model.
    if (this.customModel) {
      return this.runWithCustomModel(userPrompt);
    }
    return this.runWithProviderRotation(userPrompt);
  }

  /**
   * Run using the caller-supplied custom model. No provider rotation:
   * errors propagate directly to the caller.
   */
  private async runWithCustomModel(userPrompt: string): Promise<RunResult> {
    const initialProvider = 'custom';
    const runState = await this.stateStore.loadOrCreate(userPrompt, initialProvider);

    logger.info(runState.isNew ? 'Starting new task (custom model)' : 'Resuming existing task (custom model)', {
      promptHash: runState.promptHash,
      threadId: runState.threadId,
      existingTodos: runState.todos.length,
    });

    try {
      const finalText = await this.executeWithModel(userPrompt, runState.promptHash, runState.threadId, this.customModel!, 'custom', runState.todos);
      await this.stateStore.complete(runState.promptHash, finalText);
      logger.info('Task completed (custom model)', { promptHash: runState.promptHash, finalTextLength: finalText.length });
      return { promptHash: runState.promptHash, finalText, providerUsed: 'custom' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Task failed (custom model)', { promptHash: runState.promptHash, message: message.slice(0, 200) });
      await this.stateStore.fail(runState.promptHash, message);
      throw error;
    }
  }

  /**
   * Run using the built-in NVIDIA → OpenRouter → HuggingFace provider
   * rotation. On quota exhaustion, switches to the next provider and
   * rebuilds the deep agent with the same thread/checkpointer/backend.
   */
  private async runWithProviderRotation(userPrompt: string): Promise<RunResult> {
    const initialProvider: ProviderName = 'nvidia';
    const runState = await this.stateStore.loadOrCreate(userPrompt, initialProvider);
    const providerManager = new ProviderManager(runState.currentProvider as ProviderName);

    logger.info(runState.isNew ? 'Starting new task' : 'Resuming existing task', {
      promptHash: runState.promptHash,
      threadId: runState.threadId,
      provider: providerManager.current,
      existingTodos: runState.todos.length,
    });

    let lastKnownTodos: TodoSnapshot[] = runState.todos;
    let attemptCount = 0;

    while (true) {
      attemptCount++;
      try {
        logger.info('Attempt starting', { promptHash: runState.promptHash, attempt: attemptCount, provider: providerManager.current, todoCount: lastKnownTodos.length });
        const finalText = await this.executeWithModel(userPrompt, runState.promptHash, runState.threadId, providerManager.getModel(), providerManager.current, lastKnownTodos);
        await this.stateStore.complete(runState.promptHash, finalText);
        logger.info('Task completed', { promptHash: runState.promptHash, provider: providerManager.current, finalTextLength: finalText.length });
        return { promptHash: runState.promptHash, finalText, providerUsed: providerManager.current };
      } catch (error) {
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

  /**
   * Shared execution logic: builds a deep agent with the given model,
   * streams it, and persists todo state as it progresses.
   */
  private async executeWithModel(
    userPrompt: string,
    promptHash: string,
    threadId: string,
    model: BaseLanguageModel,
    providerLabel: string,
    existingTodos: TodoSnapshot[],
  ): Promise<string> {
    const resumeNote = existingTodos.length > 0
      ? `## Resuming a prior run\nThis task was previously in progress under a different provider. The durably persisted todo list so far is:\n${existingTodos
          .map((t, i) => `${i + 1}. [${t.status}] ${t.content}`)
          .join('\n')}\nDo NOT redo items marked "completed" — call write_todos to restate this exact list, then continue with the first "pending"/"in_progress" item.`
      : '';

    logger.info('Creating deep agent', { provider: providerLabel, threadId });
    const agentWithPrompt = createDeepAgent({
      model,
      systemPrompt: SYSTEM_PROMPT_TEMPLATE(resumeNote, this.systemPromptExtension),
      tools: [
        createTavilySearchTool(),
        createTavilyCrawlTool(),
        createVisionScrapeTool(),
        createPageAnalysisTool(),
        createPollinationsImageTool(),
        createCloudflareImg2ImgTool(),
        ...this.extraTools,
      ],
      subagents: [...buildDefaultSubagents(this.callbacks), ...this.extraSubagents],
      backend: this.backend,
      checkpointer: this.checkpointer,
    });

    const userMessage = existingTodos.length > 0
      ? `Resume this task exactly where it left off: ${userPrompt}`
      : userPrompt;

    logger.info('Starting agent stream', { provider: providerLabel, threadId, messageLength: userMessage.length });
    const stream = await agentWithPrompt.stream(
      { messages: [{ role: 'user', content: userMessage }] },
      { configurable: { thread_id: threadId }, recursionLimit: 100, callbacks: this.callbacks },
    );

    let lastTodosSeen: TodoSnapshot[] = existingTodos;
    let finalMessageText = '';
    let chunkCount = 0;

    for await (const chunk of stream) {
      chunkCount++;
      const state = this.extractState(chunk);
      if (state?.todos) {
        const todos: TodoSnapshot[] = state.todos.map((t: any) => ({ content: t.content ?? String(t), status: t.status ?? 'pending' }));
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
  private extractState(chunk: unknown): { todos?: unknown[]; messages?: any[] } | null {
    if (!chunk || typeof chunk !== 'object') return null;
    const values = Object.values(chunk as Record<string, unknown>);
    for (const value of values) {
      if (value && typeof value === 'object' && ('todos' in (value as object) || 'messages' in (value as object))) {
        return value as { todos?: unknown[]; messages?: any[] };
      }
    }
    if ('todos' in (chunk as object) || 'messages' in (chunk as object)) {
      return chunk as { todos?: unknown[]; messages?: any[] };
    }
    return null;
  }
}
