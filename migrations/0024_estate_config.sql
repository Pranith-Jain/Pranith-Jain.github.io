-- Migration 0024: Estate Configuration & Alert Feed
-- Personalization foundation: sector, region, tech stack, asset inventory,
-- and alert feed for noise-to-signal pipeline.

CREATE TABLE IF NOT EXISTS estate_config (
  id            TEXT PRIMARY KEY DEFAULT 'default',
  sector        TEXT NOT NULL DEFAULT '',
  sub_sector    TEXT NOT NULL DEFAULT '',
  region        TEXT NOT NULL DEFAULT '',
  tech_stack    TEXT NOT NULL DEFAULT '[]',
  priorities    TEXT NOT NULL DEFAULT '[]',
  data_types    TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO estate_config (id, sector, sub_sector, region, tech_stack, priorities, data_types)
VALUES ('default', '', '', '', '[]', '[]', '[]')
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS estate_assets (
  id            TEXT PRIMARY KEY,
  asset_type    TEXT NOT NULL CHECK(asset_type IN ('domain','ip','cidr','app','service','cloud','endpoint','identity','other')),
  value         TEXT NOT NULL,
  label         TEXT NOT NULL DEFAULT '',
  tags          TEXT NOT NULL DEFAULT '[]',
  criticality   TEXT NOT NULL DEFAULT 'medium' CHECK(criticality IN ('critical','high','medium','low')),
  metadata      TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_estate_assets_type ON estate_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_estate_assets_crit ON estate_assets(criticality);
CREATE UNIQUE INDEX IF NOT EXISTS idx_estate_assets_value ON estate_assets(value);

CREATE TABLE IF NOT EXISTS alert_feeds (
  id            TEXT PRIMARY KEY,
  alert_type    TEXT NOT NULL DEFAULT 'intel',
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  confidence    INTEGER DEFAULT 75 CHECK(confidence >= 0 AND confidence <= 100),
  severity      TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('critical','high','medium','low','info')),
  source        TEXT NOT NULL DEFAULT '',
  source_url    TEXT NOT NULL DEFAULT '',
  topics        TEXT NOT NULL DEFAULT '[]',
  matched_assets TEXT NOT NULL DEFAULT '[]',
  matched_sector INTEGER NOT NULL DEFAULT 0,
  read          INTEGER NOT NULL DEFAULT 0,
  dismissed     INTEGER NOT NULL DEFAULT 0,
  tlp           TEXT NOT NULL DEFAULT 'CLEAR',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_alert_feeds_severity ON alert_feeds(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_feeds_type ON alert_feeds(alert_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_feeds_sector ON alert_feeds(matched_sector, created_at DESC);
