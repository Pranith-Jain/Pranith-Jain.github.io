-- 0046: Per-caller ownership on shared playground stores.
--
-- Adds a nullable owner_hash (API-key id) to every user-mutated store.
-- Existing rows keep owner_hash NULL = legacy shared pool (keyless SPA
-- behavior unchanged). Keyed callers stamp new rows and are isolated to
-- their own rows + the legacy pool; ADMIN_TOKEN bypasses everywhere.
--
-- Also creates actor_watchlist, which had no DDL anywhere (its endpoints
-- 500 on fresh databases).

ALTER TABLE saved_reports ADD COLUMN owner_hash TEXT;
ALTER TABLE investigation_workspaces ADD COLUMN owner_hash TEXT;
ALTER TABLE copilot_sessions ADD COLUMN owner_hash TEXT;
ALTER TABLE copilot_saved_rules ADD COLUMN owner_hash TEXT;
ALTER TABLE vera_sessions ADD COLUMN owner_hash TEXT;
ALTER TABLE tg_saved_searches ADD COLUMN owner_hash TEXT;
ALTER TABLE ioc_watchlist ADD COLUMN owner_hash TEXT;

CREATE TABLE IF NOT EXISTS actor_watchlist (
  id TEXT PRIMARY KEY,
  actor_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  target_sectors TEXT NOT NULL DEFAULT '[]',
  target_regions TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  last_activity TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  owner_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_owner ON saved_reports(owner_hash);
CREATE INDEX IF NOT EXISTS idx_ws_owner ON investigation_workspaces(owner_hash);
CREATE INDEX IF NOT EXISTS idx_copilot_sessions_owner ON copilot_sessions(owner_hash);
CREATE INDEX IF NOT EXISTS idx_copilot_rules_owner ON copilot_saved_rules(owner_hash);
CREATE INDEX IF NOT EXISTS idx_vera_sessions_owner ON vera_sessions(owner_hash);
CREATE INDEX IF NOT EXISTS idx_tg_searches_owner ON tg_saved_searches(owner_hash);
CREATE INDEX IF NOT EXISTS idx_ioc_watch_owner ON ioc_watchlist(owner_hash);
CREATE INDEX IF NOT EXISTS idx_actor_watch_owner ON actor_watchlist(owner_hash);
