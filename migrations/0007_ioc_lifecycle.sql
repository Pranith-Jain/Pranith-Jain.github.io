-- Migration 0007: IOC Lifecycle Tracking
-- Tracks when IOCs first appear, their activity, and decay patterns.

CREATE TABLE IF NOT EXISTS ioc_lifecycle (
  indicator TEXT PRIMARY KEY,
  indicator_type TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  peak_score INTEGER DEFAULT 0,
  current_score INTEGER DEFAULT 0,
  observation_count INTEGER DEFAULT 1,
  sources_seen TEXT DEFAULT '[]',
  last_sources TEXT DEFAULT '[]',
  decay_rate REAL DEFAULT 0.0,
  tags TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ioc_lifecycle_last_seen ON ioc_lifecycle(last_seen);
CREATE INDEX IF NOT EXISTS idx_ioc_lifecycle_type ON ioc_lifecycle(indicator_type);
CREATE INDEX IF NOT EXISTS idx_ioc_lifecycle_score ON ioc_lifecycle(peak_score);
CREATE INDEX IF NOT EXISTS idx_ioc_lifecycle_first_seen ON ioc_lifecycle(first_seen);
