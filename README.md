# Free-Tier Deep Agent Framework

A TypeScript LangChain **deep agent** framework that maximizes free-tier LLM usage by
rotating across NVIDIA, HuggingFace, and OpenRouter (GLM model) on quota exhaustion,
with durable Neon-backed task/todo state so a *different* provider can seamlessly
resume a task exactly where the previous one left off.

## How it works

1. **Hash the prompt.** Every user prompt is hashed (`src/state/promptHash.ts`) to a
   stable run id. The same prompt always maps to the same durable run.
2. **Load or create run state.** `StateStore` (`src/state/stateStore.ts`) checks Neon
   for an existing run under that hash:
   - **New task:** bootstrap a fresh run row, empty todo list, start on the first
     provider (NVIDIA).
   - **Existing task:** load the persisted todo list and the provider that was active
     when the run last stopped, and resume.
3. **Run the deep agent.** `DeepAgentRunner` (`src/agents/deepAgentRunner.ts`) builds a
   `deepagents` agent using the current provider's GLM chat model, the built-in tools,
   and three first-class sub-agents (research, vision, live-data — see "Sub-agents"
   below). It streams execution and persists the todo list to Neon every time it
   changes, marking each item `completed` as soon as the agent's `write_todos` tool
   reports it done.
4. **Quota exhaustion -> provider switch.** If a call to the current provider fails
   with a rate-limit/quota error (`src/providers/errorClassifier.ts`), the runner:
   - Records the switch (`agent_events` table) with the reason.
   - Rebuilds the deep agent with the **next provider's** GLM model, but the **same**
     `thread_id`/checkpointer/todo state, so the new provider resumes from the last
     completed todo instead of starting over.
   - Repeats until success or until NVIDIA -> HuggingFace -> OpenRouter are all
     exhausted, at which point the run is marked `failed` in Neon.
5. **Sub-agents for parallelism.** `research-subagent`, `vision-subagent`, and
   `live-data-subagent` are first-class LangChain sub-agents (not separate quota
   consumers of the main provider rotation). Each uses its own `FreeTierChatModel`
   (`src/providers/freeTierChatModel.ts`), a LangChain `BaseChatModel` adapter around
   the `@freetier/orchestrator` package, which independently rotates across
   Groq/HuggingFace/NVIDIA/SambaNova/Cerebras/Cloudflare for their own text/vision
   calls — this is the same mechanism used by
   [freetier-orchestrator](https://github.com/RY0502/freetier-orchestrator) and
   [scrape-agent](https://github.com/RY0502/scrape-agent). Sub-agents never write to
   the durable StateStore directly (single-writer discipline in the parent agent
   avoids state corruption from concurrent sub-agent completions).

## Tools

- `tavily_search` / `tavily_crawl` — internet search and page extraction (Tavily API).
  Supports automatic key rotation across configured API keys (via comma-separated `TAVILY_API_KEY` or `TAVILY_API_KEY_1..N`)
  on HTTP 429, rate limits, quota exhaustion, or limit reached, failing only once all configured keys are exhausted.
  Tavily's index can return **cached/stale** snapshots, so these are best for
  content that does not change minute-to-minute (blogs, articles, tutorials,
  documentation, past events/history) — not for live facts.
- `vision_scrape` — extracts specific **data values** (text, numbers, JSON fields)
  off a rendered page/screenshot via the remote
  [scrape-agent](https://github.com/RY0502/scrape-agent) service (`POST /extract`).
  Since it renders and reads the page fresh, it is the right tool for time-sensitive
  values (live scores, prices, weather/AQI) once you already have the URL.
- `analyze_page_components` — a **separate** tool (same scrape-agent backend) for
  describing a page/screenshot's UI/layout/components (design-review style
  questions), kept distinct from `vision_scrape` so the agent doesn't conflate
  "extract this data" with "describe this UI".
- Deep agent built-ins (filesystem read/write, PDF generation, etc.) via
  `deepagents`' `FilesystemBackend` — used whenever the task needs to produce files.

## Sub-agents

| Sub-agent | Use for | Avoid for |
|---|---|---|
| `research-subagent` | Non-time-sensitive research: blogs, articles, tutorials, docs, history (`tavily_search`/`tavily_crawl`). | Real-time facts. |
| `vision-subagent` | Screenshot data-extraction (`vision_scrape`) or UI/layout analysis (`analyze_page_components`). | General web research (use research-subagent). |
| `live-data-subagent` | Real-time facts — live scores, stock/share prices, current weather/AQI. Searches for the freshest URL with `tavily_search`, then reads the current value directly off the live page with `vision_scrape`, bypassing Tavily's cached snippet. | Stable content (use research-subagent — cheaper and sufficient). |

Defined in `src/agents/subagentFactory.ts` (`buildResearchSubagent`,
`buildVisionSubagent`, `buildLiveDataSubagent`, `buildDefaultSubagents`).

## Durable state (Neon Postgres)

| Table            | Purpose                                                              |
|-------------------|-----------------------------------------------------------------------|
| `agent_runs`      | One row per prompt hash: status, current provider, thread id, result. |
| `agent_todos`     | Durable mirror of the deep agent's `write_todos` plan.                 |
| `agent_events`    | Append-only audit log: provider switches, todo completions, errors.   |
| `checkpoints` / `checkpoint_writes` | LangGraph short-term graph-state persistence (resume mid-turn). |

## Setup

```bash
npm install
cp .env.example .env   # fill in provider keys, reuse TAVILY_API_KEY / NEON_DATABASE_URL
                        # from the existing deep-agent repo's .env
npm run db:setup        # idempotent: creates the tables above if missing
npm run dev -- "Research the top 3 AI news stories today and summarize them"
```

## Using as a library

Another agent/orchestrator (e.g. an agent from
[freetier-orchestrator](https://github.com/RY0502/freetier-orchestrator)'s dependency
tree, or any specialized wrapper — stock-trading insights, image/story generation for
vlogs, etc.) can depend on this package and wrap `DeepAgentRunner` instead of forking
it. The library entry point (`src/index.ts`) exports what you need and is safe to
import without triggering the CLI (`main()` only runs when the file is executed
directly):

```ts
import { DeepAgentRunner, DatabaseClient, CONFIG, validateConfig } from 'freetier-deepagent-framework';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

validateConfig();
const db = new DatabaseClient(CONFIG.NEON_DATABASE_URL);

// Domain-specific tool for a specialized caller (e.g. a stock-trading wrapper).
const stockQuoteTool = new DynamicStructuredTool({
  name: 'get_stock_quote',
  description: 'Fetch the current quote for a stock ticker from our trading API.',
  schema: z.object({ ticker: z.string() }),
  func: async ({ ticker }) => JSON.stringify(await myTradingApi.getQuote(ticker)),
});

// extraTools/extraSubagents are merged with the framework's built-ins
// (tavily_search/crawl, vision_scrape, analyze_page_components,
// research/vision/live-data sub-agents) — you only supply what's beyond them.
const runner = new DeepAgentRunner(db, {
  extraTools: [stockQuoteTool],
  extraSubagents: [], // see SubagentDef in src/agents/subagentFactory.ts
  // Layered on top of the framework's base planning/tool rules, not a replacement.
  systemPromptExtension: 'Never place a trade without explicit user confirmation. Always cross-check a price with at least two sources before quoting it.',
  // Any LangChain BaseCallbackHandler — e.g. a metrics/cost-tracking sink that
  // listens for on_llm_*/on_tool_*/on_chain_* events for per-call latency/token/cost.
  callbacks: [myMetricsCallbackHandler],
});

const result = await runner.run('Should I buy AAPL today based on its current price and recent news?');
console.log(result.finalText);
```

`DeepAgentRunner`'s constructor `options: DeepAgentRunnerOptions` accepts:

- `extraTools?: DynamicStructuredTool[]` — merged with the built-in tools.
- `extraSubagents?: SubagentDef[]` — merged with the built-in sub-agents
  (`SubagentDef` = `{ name, description, systemPrompt, tools, model }`, same shape
  `deepagents`' subagent config expects).
- `systemPromptExtension?: string` — appended as a "## Domain rules" section on top
  of the framework's base system prompt (planning + tool/sub-agent disambiguation
  rules stay intact); use this for domain policy like trade-confirmation or
  content-moderation rules.
- `callbacks?: BaseCallbackHandler[]` — standard LangChain callback handlers attached
  to every agent run, for per-tool/per-LLM-call observability (latency, token usage,
  cost) independent of the coarse `agent_events` provider-switch audit log.
- `extraMiddleware?: AgentMiddleware[]` (or `middleware?: AgentMiddleware[]`) — custom
  middleware attached to the underlying `createDeepAgent` invocation. Note that `TodoListMiddleware`
  from `langchain` is always prepended automatically so the `write_todos` tool, the `todos`
  state channel, and the todo-planning prompt remain active and durable across provider swaps.
- `backend?: BackendProtocol` — concrete filesystem/storage backend instance (defaults to
  `new FilesystemBackend()`). For `StoreBackend`, pass a concrete instance with an explicit
  `namespace` (e.g. `new StoreBackend({ namespace: ['user', userId] })`). Backend factory
  functions are no longer used.

All other behavior (provider rotation, Neon-backed durable resume, todo tracking) is
unchanged — the wrapping agent gets that for free and only needs to supply its own
domain tools/sub-agents and a Neon connection string.

## Configuration (`.env`)

See `.env.example`. Key variables:

- `NVIDIA_API_KEY`, `OPENROUTER_API_KEY`, `HUGGINGFACE_API_KEY` — one key per provider;
  rotation order is fixed NVIDIA -> OpenRouter -> HuggingFace.
- `NVIDIA_DEEP_AGENT_MODEL` / `HUGGINGFACE_DEEP_AGENT_MODEL` / `OPENROUTER_DEEP_AGENT_MODEL` — GLM model id per provider.
- `TAVILY_API_KEY` (or `TAVILY_API_KEY_1`, `TAVILY_API_KEY_2`, etc., or comma-separated keys), `NEON_DATABASE_URL` — reused from the existing deep-agent repo.
- `SCRAPE_AGENT_URL` — defaults to `https://scrape-agent.onrender.com`.
- `MAX_PARALLEL_SUBAGENTS` — sub-agent concurrency (currently informational; enforce
  in your own orchestration code if you fan out sub-agent calls manually).

## Notes / assumptions

- NVIDIA NIM, the HuggingFace Inference Router, and OpenRouter all expose
  OpenAI-compatible `/chat/completions` endpoints, so the main deep agent's provider
  models are all built with a single `ChatOpenAI` client
  (`src/providers/providerManager.ts`) pointed at each provider's base URL — no
  bespoke per-provider SDK is required.
- Quota detection uses HTTP 429 + provider quota/rate-limit error-message patterns
  (`src/providers/errorClassifier.ts`), matching the classification style used by
  `@freetier/orchestrator`.
- `@freetier/orchestrator` is installed directly from its GitHub repo
  (`github:RY0502/freetier-orchestrator`) since it is not published to the npm
  registry.

## Roadmap: making this truly generic / production-ready

The current design already lets a specialized wrapper (stock-trading insights,
image/story generation for vlogs, etc.) supply `extraTools`/`extraSubagents`,
`systemPromptExtension`, and `callbacks` (see "Using as a library") without forking
the framework. To go further, the highest-value next additions are:

1. **Structured/typed final output, not just `finalText`.** `RunResult.finalText` is
   free-form text. A wrapper doing stock-trading insights or vlog generation needs to
   parse structured data reliably. Let callers pass an optional Zod `outputSchema`
   (or JSON schema) into `DeepAgentRunnerOptions`/`run()`; have the system prompt
   instruct the agent to emit a final JSON block matching it, and validate/parse it in
   `DeepAgentRunner` before returning — falling back to raw text if parsing fails.
2. ~~Pluggable/overridable system prompt and tool-conflict guidance.~~ **Done** —
   `DeepAgentRunnerOptions.systemPromptExtension` layers domain rules on top of the
   framework's base planning/tool-disambiguation prompt.
3. ~~Tool/sub-agent-level observability and cost/latency accounting.~~ **Done** —
   `DeepAgentRunnerOptions.callbacks` (`BaseCallbackHandler[]`) is attached to every
   agent run, giving `on_llm_*`/`on_tool_*`/`on_chain_*` events for a caller's own
   metrics/cost sink, distinct from the coarse `agent_events` provider-switch log.
4. **First-class human-in-the-loop / approval gating.** Some domains (trading actions,
   publishing a generated story/image publicly) must not auto-execute irreversible
   side effects. `deepagents` supports interrupt-based human review; expose an
   `approvalRequired: (toolName) => boolean` hook (or a list of tool names) in
   `DeepAgentRunnerOptions` so a wrapper can force specific tools (e.g. `place_trade`,
   `publish_post`) to pause for external confirmation before executing, reusing the
   existing checkpointer for the pause/resume.
5. **Config-driven provider/model rotation instead of the fixed NVIDIA → HuggingFace →
   OpenRouter list.** `PROVIDER_ORDER` (`src/providers/providerManager.ts`) is a fixed
   array. A generic framework should let callers supply their own ordered list of
   OpenAI-compatible providers (or a `LanguageModelLike[]` list directly) via
   `DeepAgentRunnerOptions`, so a wrapper that already has its own provider keys/quota
   strategy isn't forced into this framework's specific 3-provider rotation.

Additional (lower-priority) hardening for a fully production system: structured
logging (replace the `console.*` `logger` with something like `pino`), retry/backoff
tuning per-tool (not just per-provider), rate-limiting of concurrent sub-agent
invocations against `MAX_PARALLEL_SUBAGENTS`, and a health-check/readiness endpoint if
this is ever run as a long-lived service rather than a one-shot CLI/library call.
