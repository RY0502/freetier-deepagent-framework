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
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS agent_runs (
    prompt_hash TEXT PRIMARY KEY,
    user_prompt TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | in_progress | completed | failed
    current_provider TEXT,
    thread_id TEXT NOT NULL,
    final_result TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_todos (
    id SERIAL PRIMARY KEY,
    prompt_hash TEXT NOT NULL REFERENCES agent_runs(prompt_hash) ON DELETE CASCADE,
    todo_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | in_progress | completed
    result_note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (prompt_hash, todo_index)
);

CREATE TABLE IF NOT EXISTS agent_events (
    id SERIAL PRIMARY KEY,
    prompt_hash TEXT NOT NULL REFERENCES agent_runs(prompt_hash) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- provider_switch | todo_completed | error | run_started | run_completed
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_todos_prompt_hash ON agent_todos(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_agent_events_prompt_hash ON agent_events(prompt_hash);

-- LangGraph checkpoint persistence (deep agent short-term/graph state),
-- keyed by thread_id so a run can resume its in-flight graph state after
-- a process restart or provider switch, in addition to the durable todo
-- state above.
CREATE TABLE IF NOT EXISTS checkpoints (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    checkpoint JSONB NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS checkpoint_writes (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    channel TEXT NOT NULL,
    value JSONB,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_id ON checkpoints(thread_id);
`;
//# sourceMappingURL=schema.js.map