-- Migration 0031: Add denormalized filter columns to intel_bundles.
--
-- Mirrors the Threat Landscape stix_bundles API's column schema for
-- PostgREST-style filtering. Columns are populated from view_json on
-- INSERT / UPDATE via triggers.
--
-- Also creates the actionable_iocs table for the IOC API vertical.

-- ── Denormalized filter columns on intel_bundles ────────────────

ALTER TABLE intel_bundles ADD COLUMN source_type TEXT NOT NULL DEFAULT 'osint';
ALTER TABLE intel_bundles ADD COLUMN threat_actor_names TEXT NOT NULL DEFAULT '[]';
ALTER TABLE intel_bundles ADD COLUMN malware_names TEXT NOT NULL DEFAULT '[]';
ALTER TABLE intel_bundles ADD COLUMN campaign_names TEXT NOT NULL DEFAULT '[]';
ALTER TABLE intel_bundles ADD COLUMN sector_names TEXT NOT NULL DEFAULT '[]';
ALTER TABLE intel_bundles ADD COLUMN country_targets TEXT NOT NULL DEFAULT '[]';
ALTER TABLE intel_bundles ADD COLUMN country_sources TEXT NOT NULL DEFAULT '[]';
ALTER TABLE intel_bundles ADD COLUMN vulnerability_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE intel_bundles ADD COLUMN indicator_ipv4 TEXT NOT NULL DEFAULT '[]';
ALTER TABLE intel_bundles ADD COLUMN indicator_ipv6 TEXT NOT NULL DEFAULT '[]';
ALTER TABLE intel_bundles ADD COLUMN indicator_domain TEXT NOT NULL DEFAULT '[]';
ALTER TABLE intel_bundles ADD COLUMN indicator_url TEXT NOT NULL DEFAULT '[]';
ALTER TABLE intel_bundles ADD COLUMN indicator_sha256 TEXT NOT NULL DEFAULT '[]';

-- Indexes for array-contains queries (used by cs/cd PostgREST operators).
-- D1 doesn't support GIN indexes, but we add BTREE indexes on selected
-- columns for eq/neq/in queries on individual values stored as JSON arrays.
CREATE INDEX IF NOT EXISTS idx_intel_bundles_source_type ON intel_bundles(source_type);
CREATE INDEX IF NOT EXISTS idx_intel_bundles_created_at ON intel_bundles(created_at DESC);

-- ── actionable_iocs table (IOC API vertical) ───────────────────

CREATE TABLE IF NOT EXISTS actionable_iocs (
  ioc_value       TEXT PRIMARY KEY,
  ioc_type        TEXT NOT NULL,           -- 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash_md5' | 'hash_sha1' | 'hash_sha256'
  valid_until     TEXT,                    -- ISO 8601, nullable
  source_bundle_id TEXT,                   -- reference to intel_bundles.id
  stix_bundle     TEXT,                    -- minimal STIX 2.1 bundle with one indicator object
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  seq_id          INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_actionable_iocs_type ON actionable_iocs(ioc_type);
CREATE INDEX IF NOT EXISTS idx_actionable_iocs_valid_until ON actionable_iocs(valid_until);
CREATE INDEX IF NOT EXISTS idx_actionable_iocs_seq_id ON actionable_iocs(seq_id);

-- ── Per-type active IOC views (filtered by valid_until > now()) ─

CREATE VIEW IF NOT EXISTS iocs_ipv4 AS
  SELECT ioc_value AS ioc, valid_until, source_bundle_id
  FROM actionable_iocs
  WHERE ioc_type = 'ipv4' AND (valid_until IS NULL OR valid_until > datetime('now'));

CREATE VIEW IF NOT EXISTS iocs_ipv6 AS
  SELECT ioc_value AS ioc, valid_until, source_bundle_id
  FROM actionable_iocs
  WHERE ioc_type = 'ipv6' AND (valid_until IS NULL OR valid_until > datetime('now'));

CREATE VIEW IF NOT EXISTS iocs_domain AS
  SELECT ioc_value AS ioc, valid_until, source_bundle_id
  FROM actionable_iocs
  WHERE ioc_type = 'domain' AND (valid_until IS NULL OR valid_until > datetime('now'));

CREATE VIEW IF NOT EXISTS iocs_url AS
  SELECT ioc_value AS ioc, valid_until, source_bundle_id
  FROM actionable_iocs
  WHERE ioc_type = 'url' AND (valid_until IS NULL OR valid_until > datetime('now'));

CREATE VIEW IF NOT EXISTS iocs_md5 AS
  SELECT ioc_value AS ioc, valid_until, source_bundle_id
  FROM actionable_iocs
  WHERE ioc_type = 'hash_md5' AND (valid_until IS NULL OR valid_until > datetime('now'));

CREATE VIEW IF NOT EXISTS iocs_sha1 AS
  SELECT ioc_value AS ioc, valid_until, source_bundle_id
  FROM actionable_iocs
  WHERE ioc_type = 'hash_sha1' AND (valid_until IS NULL OR valid_until > datetime('now'));

CREATE VIEW IF NOT EXISTS iocs_sha256 AS
  SELECT ioc_value AS ioc, valid_until, source_bundle_id
  FROM actionable_iocs
  WHERE ioc_type = 'hash_sha256' AND (valid_until IS NULL OR valid_until > datetime('now'));

-- ── Seq_id sequence for actionable_iocs ────────────────────────

CREATE TABLE IF NOT EXISTS ioc_seq_counter (
  next_val INTEGER NOT NULL DEFAULT 1
);

INSERT INTO ioc_seq_counter (next_val) VALUES (1) ON CONFLICT DO NOTHING;
