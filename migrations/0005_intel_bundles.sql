-- intel_bundles: per-feed-item STIX 2.1 bundles + denormalized view.
--
-- One row per (source_id, item_ref). `id` is a deterministic UUIDv5-derived
-- STIX bundle ID, so re-renders are idempotent and the same item URL across
-- the platform always serves the same bundle.
--
-- `extracted_hash` is the diff key for the monitoring sub-project: when a
-- re-render produces a different hash for an existing row, update + bump
-- `updated_at`. That is the foundation for "this briefing changed — here's
-- what was added" diffing.
--
-- JSON columns stored as TEXT; D1 has no native JSON type (existing
-- convention in this repo's migrations).

CREATE TABLE IF NOT EXISTS intel_bundles (
  id              TEXT PRIMARY KEY,           -- 'bundle--<uuidv5>'
  source_id       TEXT NOT NULL,              -- 'briefings', 'rss:unit42.com', 'tool', etc.
  item_ref        TEXT NOT NULL,              -- URL or stable item identifier
  report_id       TEXT NOT NULL,              -- 'report--<uuidv5>'
  title           TEXT NOT NULL,
  published_at    TEXT,                       -- ISO8601, nullable
  extracted_hash  TEXT NOT NULL,              -- sha256(title|body|extraction-result)
  bundle_json     TEXT NOT NULL,              -- strict STIX 2.1 bundle (JSON-stringified)
  view_json       TEXT NOT NULL,              -- denormalized IntelView (JSON-stringified)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ioc_count       INTEGER NOT NULL DEFAULT 0,
  actor_count     INTEGER NOT NULL DEFAULT 0,
  malware_count   INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intel_bundles_source_ref ON intel_bundles(source_id, item_ref);
CREATE INDEX IF NOT EXISTS idx_intel_bundles_extracted_hash ON intel_bundles(extracted_hash);
CREATE INDEX IF NOT EXISTS idx_intel_bundles_published_at ON intel_bundles(published_at DESC);
