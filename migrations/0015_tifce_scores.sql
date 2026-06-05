-- Migration 0015: TIFCE (TI Feed Content Evaluation) historical scores
-- Persists per-feed four-pillar scores + composite on every TIFCE build so
-- the engine can compute Pillar-4 (freshness) velocity as IOC-add rate over
-- the trailing 7d window, and so the UI can chart a 30-day quality trend.
--
-- One row per (feed_id, generated_at). The route upserts a row per feed on
-- every build; the unique index guarantees idempotency if a single minute
-- produces two builds (e.g. cron retry + a manual refresh).
--
-- Columns map 1:1 to api/src/lib/tifce.ts PillarScore + CompositeScore shapes
-- so the route can read back what's there without re-deriving.

CREATE TABLE IF NOT EXISTS tifce_scores (
  feed_id          TEXT    NOT NULL,
  generated_at     TEXT    NOT NULL,                       -- ISO 8601 (UTC)
  contributions    INTEGER NOT NULL DEFAULT 0,             -- IOCs this feed contributed this build
  originality      REAL    NOT NULL DEFAULT 0,             -- 0–100, Pillar 1 (rarity-weighted)
  env_relevance    REAL    NOT NULL DEFAULT 0,             -- 0–100, Pillar 2 (platform-signal proxy)
  signal_noise     REAL    NOT NULL DEFAULT 0,             -- 0–100, Pillar 3 (TP-correlation ratio)
  freshness        REAL    NOT NULL DEFAULT 0,             -- 0–100, Pillar 4 (recency + velocity)
  composite        REAL    NOT NULL DEFAULT 0,             -- 0–100, weighted blend
  -- Forensic details (debug-grade, NOT surfaced to UI today):
  unique_indicators   INTEGER NOT NULL DEFAULT 0,          -- IOCs only this feed carries
  shared_indicators  INTEGER NOT NULL DEFAULT 0,           -- IOCs in 2+ feeds (this feed's share)
  tp_linked_indicators INTEGER NOT NULL DEFAULT 0,        -- IOCs this feed carried that are peak_score>0
  newest_observation TEXT,                                 -- newest per-entry timestamp from live-iocs
  velocity_per_day   REAL    NOT NULL DEFAULT 0,           -- IOC-add slope (7d window)
  PRIMARY KEY (feed_id, generated_at)
);

CREATE INDEX IF NOT EXISTS idx_tifce_scores_generated_at ON tifce_scores (generated_at);
CREATE INDEX IF NOT EXISTS idx_tifce_scores_feed_recent  ON tifce_scores (feed_id, generated_at DESC);
