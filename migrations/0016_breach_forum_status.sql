-- Migration 0016: Breach-forum status history
-- Persists the per-forum status snapshot from each hourly deepdarkCTI re-read
-- so the route can surface status transitions (active → seized, online → offline,
-- etc.) as high-signal CTI events. Without history you only ever see the
-- current status; with it, you can chart stability + flag flapping.
--
-- The cron writes a row per (forum_name, observed_at) — same forum
-- appearing across multiple hours yields multiple rows, which is the point.
-- Deduplication of "same status for 3 days in a row" is the route's job
-- (it groups consecutive rows with identical status into one span).
--
-- Schema notes:
--   - `name` is normalized lowercase so the diff ignores casing churn
--     between deepdarkCTI snapshots ("BreachForums" vs "breachforums").
--   - `source` distinguishes deepdarkCTI rows from the curated list
--     (api/src/routes/breach-forums.ts CURATED). Both go in this table;
--     they're merged by `name` in the diff.
--   - `observed_at` is the snapshot timestamp (one row per snapshot, not
--     one per row-of-data); the cron tags every row it writes in a single
--     pass with the same timestamp.
--   - 90-day retention is enforced by the existing retention sweep
--     (runRetentionSweep in api/src/lib/retention.ts) — old rows drop off
--     automatically, no extra sweep job needed.

CREATE TABLE IF NOT EXISTS breach_forum_status (
  name          TEXT    NOT NULL,                       -- normalized lowercase forum name
  source        TEXT    NOT NULL,                       -- 'ddc' | 'curated'
  status        TEXT    NOT NULL,                       -- 'online' | 'offline' | 'valid' | 'expired' | 'unknown' | 'active' | 'volatile' | 'intermittent' | 'seized' | 'defunct'
  url           TEXT,                                   -- last-seen URL (.onion or clearweb)
  onion         INTEGER NOT NULL DEFAULT 0,             -- 1 if .onion, 0 otherwise
  category      TEXT,                                   -- 'Criminal Forums' | 'Dark Markets' | 'Notable breach/leak forum' | etc.
  observed_at   TEXT    NOT NULL                        -- ISO 8601 (UTC) of the snapshot
);

CREATE INDEX IF NOT EXISTS idx_bfs_observed_at ON breach_forum_status (observed_at);
CREATE INDEX IF NOT EXISTS idx_bfs_name_recent  ON breach_forum_status (name, observed_at DESC);
