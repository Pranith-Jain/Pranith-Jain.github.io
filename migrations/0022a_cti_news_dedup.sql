-- Migration 0022: Add unique index on cti_news(title, source) for dedup
-- Fixes duplicate articles created by hourly collection cycles.

CREATE UNIQUE INDEX IF NOT EXISTS idx_cti_news_unique ON cti_news(title, source);
