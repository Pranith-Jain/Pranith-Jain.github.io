-- API key usage tracking for per-key rate limiting.
--
-- Tracks daily and per-minute request counts per API key.
-- Counters reset automatically when the bucket changes.

CREATE TABLE IF NOT EXISTS api_key_usage (
  key_hash      TEXT PRIMARY KEY,
  role          TEXT NOT NULL DEFAULT 'readonly',
  daily_count   INTEGER NOT NULL DEFAULT 0,
  minute_count  INTEGER NOT NULL DEFAULT 0,
  daily_bucket  TEXT NOT NULL,      -- YYYY-MM-DD format
  minute_bucket INTEGER NOT NULL,   -- Unix timestamp / 60
  last_request_at TEXT NOT NULL
);

CREATE INDEX idx_usage_daily ON api_key_usage(daily_bucket);
CREATE INDEX idx_usage_role ON api_key_usage(role);
