-- Migration 0029: SSVC-V decision column + Actor Watchlist
-- Adds SSVC-V decision persist column to alert_feeds and a new actor_watchlist table for sector-filtered digests.

ALTER TABLE alert_feeds ADD COLUMN ssvc_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS actor_watchlist (
  id              TEXT PRIMARY KEY,
  actor_name      TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  target_sectors  TEXT NOT NULL DEFAULT '[]',
  target_regions  TEXT NOT NULL DEFAULT '[]',
  active          INTEGER NOT NULL DEFAULT 1,
  last_activity   TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_actor_watchlist_active ON actor_watchlist(active);
CREATE INDEX IF NOT EXISTS idx_actor_watchlist_sectors ON actor_watchlist(target_sectors);
