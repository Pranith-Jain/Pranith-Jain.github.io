-- Agent investigation sessions. Each row is one autonomous investigation run.
-- Steps are stored as a JSON array in steps_json so the Durable Object can
-- reconstruct state on alarm wake without a separate steps table.
CREATE TABLE IF NOT EXISTS agent_sessions (
  id           TEXT PRIMARY KEY,
  query        TEXT NOT NULL,
  query_type   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'running',  -- running | done | error
  steps_json   TEXT,
  report_json  TEXT,
  model_used   TEXT,
  total_steps  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_status ON agent_sessions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_recent ON agent_sessions (created_at DESC);
