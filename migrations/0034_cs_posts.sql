-- Migration 0034: Create case-study posts table for D1-backed search/scale.
--
-- Mirrors KV posts:index for queryability. Populated on publish as a dual
-- storage layer — KV for the hot read path, D1 for search/filter/analytics.

CREATE TABLE IF NOT EXISTS cs_posts (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  candidate_id TEXT,
  ioc_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  quality_total REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cs_posts_type ON cs_posts(type);
CREATE INDEX IF NOT EXISTS idx_cs_posts_published_at ON cs_posts(published_at DESC);
