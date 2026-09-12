-- AI Escape Watch community report queue.
--
-- Public submissions land as status='pending' and only reach the registry
-- after manual review (approved). Rejected reports stay visible with their
-- note so the queue itself is auditable. Forward-only: never edit.
CREATE TABLE IF NOT EXISTS ai_escape_reports (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  klass TEXT NOT NULL,
  occurred TEXT,
  purpose TEXT,
  systems TEXT,
  summary TEXT NOT NULL,
  sources TEXT,
  handle TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  review_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_escape_reports_status ON ai_escape_reports(status, created_at);
