-- Migration 0027: CyberPulse breach/leak incident tracker
-- Structured incident database for breaches, leaks, ransomware, extortion, and cybercrime
-- sourced from X/Twitter, Telegram, Bluesky, Mastodon firehose

CREATE TABLE IF NOT EXISTS cyberpulse_incidents (
  id              TEXT PRIMARY KEY,
  -- Incident classification
  incident_type   TEXT NOT NULL CHECK(incident_type IN (
    'ransomware', 'data_leak', 'credential_leak', 'extortion',
    'defacement', 'supply_chain', 'zero_day', 'breach', 'ddos',
    'hacktivism', 'other'
  )),
  severity        TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN (
    'critical', 'high', 'medium', 'low', 'info'
  )),
  -- Victim info
  victim_name     TEXT,
  victim_domain   TEXT,
  victim_sector   TEXT CHECK(victim_sector IN (
    'healthcare', 'finance', 'government', 'education', 'technology',
    'retail', 'energy', 'manufacturing', 'telecom', 'media',
    'transportation', 'legal', 'nonprofit', 'other', NULL
  )),
  victim_country  TEXT,
  -- Threat actor
  threat_actor    TEXT,
  threat_actor_aliases TEXT DEFAULT '[]',
  -- Incident details
  title           TEXT NOT NULL,
  description     TEXT,
  data_types_leaked TEXT DEFAULT '[]',
  records_count   INTEGER,
  data_volume     TEXT,
  -- Source attribution
  source_platform TEXT NOT NULL CHECK(source_platform IN (
    'x', 'telegram', 'bluesky', 'mastodon', 'manual', 'rss', 'other'
  )),
  source_url      TEXT,
  source_handle   TEXT,
  source_text     TEXT,
  source_author   TEXT,
  source_avatar   TEXT,
  -- Classification
  confidence      REAL DEFAULT 0.5,
  classification_method TEXT DEFAULT 'keyword' CHECK(classification_method IN (
    'keyword', 'llm', 'manual', 'pattern', 'hybrid'
  )),
  -- Timestamps
  discovered_at   TEXT NOT NULL,
  reported_at     TEXT,
  updated_at      TEXT NOT NULL,
  -- Dedup
  dedup_hash      TEXT,
  duplicate_of    TEXT,
  -- Tags
  tags            TEXT DEFAULT '[]',
  mitre_techniques TEXT DEFAULT '[]',
  -- Engagement (from source)
  source_likes    INTEGER DEFAULT 0,
  source_retweets INTEGER DEFAULT 0,
  source_replies  INTEGER DEFAULT 0,
  source_views    INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cp_discovered ON cyberpulse_incidents(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_severity ON cyberpulse_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_cp_type ON cyberpulse_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_cp_platform ON cyberpulse_incidents(source_platform);
CREATE INDEX IF NOT EXISTS idx_cp_actor ON cyberpulse_incidents(threat_actor);
CREATE INDEX IF NOT EXISTS idx_cp_victim ON cyberpulse_incidents(victim_name);
CREATE INDEX IF NOT EXISTS idx_cp_sector ON cyberpulse_incidents(victim_sector);
CREATE INDEX IF NOT EXISTS idx_cp_dedup ON cyberpulse_incidents(dedup_hash);
CREATE INDEX IF NOT EXISTS idx_cp_country ON cyberpulse_incidents(victim_country);

CREATE TABLE IF NOT EXISTS cyberpulse_scan_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source          TEXT NOT NULL,
  handle          TEXT,
  query           TEXT,
  scanned_at      TEXT NOT NULL,
  items_found     INTEGER DEFAULT 0,
  incidents_created INTEGER DEFAULT 0,
  incidents_deduped INTEGER DEFAULT 0,
  duration_ms     INTEGER,
  error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_cp_scan_source ON cyberpulse_scan_log(source);
CREATE INDEX IF NOT EXISTS idx_cp_scan_time ON cyberpulse_scan_log(scanned_at DESC);

CREATE TABLE IF NOT EXISTS cyberpulse_watchlist (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  platform        TEXT NOT NULL CHECK(platform IN ('x', 'telegram', 'bluesky', 'mastodon')),
  handle          TEXT NOT NULL,
  name            TEXT,
  category        TEXT DEFAULT 'cti',
  priority        INTEGER DEFAULT 5,
  active          INTEGER DEFAULT 1,
  added_at        TEXT NOT NULL,
  last_scanned    TEXT,
  notes           TEXT,
  UNIQUE(platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_cp_watch_active ON cyberpulse_watchlist(active, platform);

CREATE TABLE IF NOT EXISTS cyberpulse_stats_cache (
  period          TEXT NOT NULL,
  computed_at     TEXT NOT NULL,
  total_incidents INTEGER,
  by_type         TEXT DEFAULT '{}',
  by_severity     TEXT DEFAULT '{}',
  by_sector       TEXT DEFAULT '{}',
  by_country      TEXT DEFAULT '{}',
  by_actor        TEXT DEFAULT '{}',
  by_platform     TEXT DEFAULT '{}',
  top_actors      TEXT DEFAULT '[]',
  top_victims     TEXT DEFAULT '[]',
  trend_7d        TEXT DEFAULT '[]',
  PRIMARY KEY(period)
);
