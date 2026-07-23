/**
 * Durable state schema (Neon Postgres).
 *
 * `agent_runs` — one row per unique user prompt hash. Tracks the overall
 * run status and which provider is currently active so a fresh process can
 * resume exactly where the previous one left off after a provider switch
 * or crash/restart.
 *
 * `agent_todos` — one row per todo item belonging to a run. Mirrors the
 * deep agent's in-memory `write_todos` state so it survives process
 * restarts and provider switches.
 *
 * `agent_events` — append-only audit log of provider switches, todo
 * completions, and errors, for observability/debugging.
 */
export declare const SCHEMA_SQL = "\nCREATE TABLE IF NOT EXISTS agent_runs (\n    prompt_hash TEXT PRIMARY KEY,\n    user_prompt TEXT NOT NULL,\n    status TEXT NOT NULL DEFAULT 'pending', -- pending | in_progress | completed | failed\n    current_provider TEXT,\n    thread_id TEXT NOT NULL,\n    final_result TEXT,\n    error_message TEXT,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);\n\nCREATE TABLE IF NOT EXISTS agent_todos (\n    id SERIAL PRIMARY KEY,\n    prompt_hash TEXT NOT NULL REFERENCES agent_runs(prompt_hash) ON DELETE CASCADE,\n    todo_index INTEGER NOT NULL,\n    content TEXT NOT NULL,\n    status TEXT NOT NULL DEFAULT 'pending', -- pending | in_progress | completed\n    result_note TEXT,\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n    UNIQUE (prompt_hash, todo_index)\n);\n\nCREATE TABLE IF NOT EXISTS agent_events (\n    id SERIAL PRIMARY KEY,\n    prompt_hash TEXT NOT NULL REFERENCES agent_runs(prompt_hash) ON DELETE CASCADE,\n    event_type TEXT NOT NULL, -- provider_switch | todo_completed | error | run_started | run_completed\n    details JSONB,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);\n\nCREATE INDEX IF NOT EXISTS idx_agent_todos_prompt_hash ON agent_todos(prompt_hash);\nCREATE INDEX IF NOT EXISTS idx_agent_events_prompt_hash ON agent_events(prompt_hash);\n\n-- LangGraph checkpoint persistence (deep agent short-term/graph state),\n-- keyed by thread_id so a run can resume its in-flight graph state after\n-- a process restart or provider switch, in addition to the durable todo\n-- state above.\nCREATE TABLE IF NOT EXISTS checkpoints (\n    thread_id TEXT NOT NULL,\n    checkpoint_ns TEXT NOT NULL DEFAULT '',\n    checkpoint_id TEXT NOT NULL,\n    parent_checkpoint_id TEXT,\n    checkpoint JSONB NOT NULL,\n    metadata JSONB,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)\n);\n\nCREATE TABLE IF NOT EXISTS checkpoint_writes (\n    thread_id TEXT NOT NULL,\n    checkpoint_ns TEXT NOT NULL DEFAULT '',\n    checkpoint_id TEXT NOT NULL,\n    task_id TEXT NOT NULL,\n    idx INTEGER NOT NULL,\n    channel TEXT NOT NULL,\n    value JSONB,\n    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)\n);\n\nCREATE INDEX IF NOT EXISTS idx_checkpoints_thread_id ON checkpoints(thread_id);\n\n-- Generic caller-defined checkpoint state, keyed by the same prompt_hash used\n-- for the agent_runs table so a downstream project (e.g. a video-generation\n-- pipeline) can persist arbitrary fine-grained sub-step progress (a single\n-- character pose, a single scene's audio clip, etc.) and correctly resume\n-- from exactly where it left off on a re-run of the identical prompt --\n-- without needing its own separate database or storage mechanism.\nCREATE TABLE IF NOT EXISTS agent_custom_state (\n    prompt_hash TEXT NOT NULL REFERENCES agent_runs(prompt_hash) ON DELETE CASCADE,\n    state_key TEXT NOT NULL,\n    value JSONB NOT NULL,\n    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n    PRIMARY KEY (prompt_hash, state_key)\n);\n\nCREATE INDEX IF NOT EXISTS idx_agent_custom_state_prompt_hash ON agent_custom_state(prompt_hash);\n";
export type RunStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
export type TodoStatus = 'pending' | 'in_progress' | 'completed';
export interface AgentRunRow {
    prompt_hash: string;
    user_prompt: string;
    status: RunStatus;
    current_provider: string | null;
    thread_id: string;
    final_result: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}
export interface AgentTodoRow {
    id: number;
    prompt_hash: string;
    todo_index: number;
    content: string;
    status: TodoStatus;
    result_note: string | null;
    updated_at: string;
}
