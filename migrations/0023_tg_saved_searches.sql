-- Migration 0023: Saved Telegram Searches
-- Persistent saved boolean queries for the Telegram intelligence search UI.

CREATE TABLE IF NOT EXISTS tg_saved_searches (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  query       TEXT NOT NULL,
  mode        TEXT NOT NULL DEFAULT 'boolean' CHECK(mode IN ('general', 'boolean')),
  filters     TEXT NOT NULL DEFAULT '{}',
  sort_order  TEXT NOT NULL DEFAULT 'newest' CHECK(sort_order IN ('newest', 'oldest')),
  date_range  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tg_saved_searches_updated ON tg_saved_searches(updated_at DESC);
