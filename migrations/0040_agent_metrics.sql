-- Migration 0040: Agent Metrics
-- Store investigation completion metrics for observability dashboard.

CREATE TABLE IF NOT EXISTS agent_metrics (
  id              TEXT PRIMARY KEY,
  query           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'done', 'error')),
  total_steps     INTEGER NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  quality_score   INTEGER NOT NULL DEFAULT 0,
  model_used      TEXT NOT NULL DEFAULT '',
  tools_used      TEXT NOT NULL DEFAULT '[]',
  error           TEXT,
  completed_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_status ON agent_metrics(status);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_completed_at ON agent_metrics(completed_at);
CREATE INDEX IF NOT EXISTS idx_agent_metrics_quality_score ON agent_metrics(quality_score);
