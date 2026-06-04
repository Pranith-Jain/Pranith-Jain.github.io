-- migrations/0014_reports.sql
-- Persisted report-generation jobs for the Copilot full-report pipeline.
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  subject     TEXT NOT NULL,
  template    TEXT NOT NULL,
  tlp         TEXT NOT NULL DEFAULT 'AMBER',
  status      TEXT NOT NULL DEFAULT 'queued',  -- queued | building | done | error
  report_json TEXT,                            -- serialized Report (null until first phase persists)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports (status, created_at);
