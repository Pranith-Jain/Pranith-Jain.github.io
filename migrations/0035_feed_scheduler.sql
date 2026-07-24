-- Migration 0035: Feed Scheduler D1 Tables
-- Migrate feed job definitions and run history from KV to D1

CREATE TABLE IF NOT EXISTS feed_jobs (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  source_url      TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  parser          TEXT NOT NULL CHECK(parser IN ('plaintext-ips', 'plaintext-domains', 'plaintext-urls', 'plaintext-hashes', 'csv', 'json')),
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  last_run_at     TEXT,
  last_status     TEXT CHECK(last_status IN ('pending', 'running', 'ok', 'error')),
  last_item_count INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  tags            TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS feed_run_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id      TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status      TEXT NOT NULL CHECK(status IN ('ok', 'error')),
  item_count  INTEGER NOT NULL DEFAULT 0,
  error       TEXT,
  FOREIGN KEY (job_id) REFERENCES feed_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feed_history_job ON feed_run_history(job_id);
CREATE INDEX IF NOT EXISTS idx_feed_history_time ON feed_run_history(started_at DESC);
