-- Migration 0032: Create content_performance table for analytics feedback loop.
--
-- Stores per-type aggregated engagement data from social metrics, serving as
-- the analytics feedback loop that pipes "what performs best" back into the
-- social generation prompts.
--
-- Refreshed periodically by refreshSocialMetricsNow() in the cron pipeline.

CREATE TABLE IF NOT EXISTS content_performance (
  type TEXT PRIMARY KEY,
  posts INTEGER NOT NULL DEFAULT 0,
  avg_engagement REAL NOT NULL DEFAULT 0,
  total_impressions INTEGER NOT NULL DEFAULT 0,
  top_hook_angle TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_performance_avg_engagement
  ON content_performance(avg_engagement DESC);
