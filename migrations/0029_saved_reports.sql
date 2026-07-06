-- Migration 0029: Saved Reports
-- Store report analyzer results for later retrieval

CREATE TABLE IF NOT EXISTS saved_reports (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  source_url  TEXT,
  source_text TEXT,
  report_json TEXT NOT NULL,
  text_length INTEGER NOT NULL DEFAULT 0,
  elapsed_ms  INTEGER NOT NULL DEFAULT 0,
  ioc_count   INTEGER NOT NULL DEFAULT 0,
  ttp_count   INTEGER NOT NULL DEFAULT 0,
  cve_count   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_created_at ON saved_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_saved_reports_title ON saved_reports(title);
