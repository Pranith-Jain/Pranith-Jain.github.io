-- Migration number: 0006 	 2026-05-25T00:00:00.000Z
-- API key management for programmatic access control.

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  key_hash     TEXT NOT NULL UNIQUE,   -- SHA-256 of raw key
  prefix       TEXT NOT NULL,          -- first 8 chars of raw key (for display)
  label        TEXT NOT NULL,          -- human-readable name
  role         TEXT NOT NULL DEFAULT 'readonly' CHECK(role IN ('admin', 'readonly')),
  created_at   TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at   TEXT
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_revoked ON api_keys(revoked_at);
