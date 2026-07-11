-- Migration 0030: Add 'reddit' to CyberPulse source_platform CHECK constraint
-- Reddit items were silently dropped because the CHECK constraint didn't include 'reddit'

-- Recreate cyberpulse_incidents with 'reddit' in the source_platform CHECK
CREATE TABLE IF NOT EXISTS cyberpulse_incidents_v2 (
  id              TEXT PRIMARY KEY,
  incident_type   TEXT NOT NULL CHECK(incident_type IN (
    'ransomware', 'data_leak', 'credential_leak', 'extortion',
    'defacement', 'supply_chain', 'zero_day', 'breach', 'ddos',
    'hacktivism', 'other'
  )),
  severity        TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN (
    'critical', 'high', 'medium', 'low', 'info'
  )),
  victim_name     TEXT,
  victim_domain   TEXT,
  victim_sector   TEXT CHECK(victim_sector IN (
    'healthcare', 'finance', 'government', 'education', 'technology',
    'retail', 'energy', 'manufacturing', 'telecom', 'media',
    'transportation', 'legal', 'nonprofit', 'other', NULL
  )),
  victim_country  TEXT,
  threat_actor    TEXT,
  threat_actor_aliases TEXT DEFAULT '[]',
  title           TEXT NOT NULL,
  description     TEXT,
  data_types_leaked TEXT DEFAULT '[]',
  records_count   INTEGER,
  data_volume     TEXT,
  source_platform TEXT NOT NULL CHECK(source_platform IN (
    'x', 'telegram', 'bluesky', 'mastodon', 'reddit', 'manual', 'rss', 'other'
  )),
  source_url      TEXT,
  source_handle   TEXT,
  source_text     TEXT,
  source_author   TEXT,
  source_avatar   TEXT,
  confidence      REAL DEFAULT 0.5,
  classification_method TEXT DEFAULT 'keyword' CHECK(classification_method IN (
    'keyword', 'llm', 'manual', 'pattern', 'hybrid'
  )),
  discovered_at   TEXT NOT NULL,
  reported_at     TEXT,
  updated_at      TEXT NOT NULL,
  dedup_hash      TEXT,
  duplicate_of    TEXT,
  tags            TEXT DEFAULT '[]',
  mitre_techniques TEXT DEFAULT '[]',
  source_likes    INTEGER DEFAULT 0,
  source_retweets INTEGER DEFAULT 0,
  source_replies  INTEGER DEFAULT 0,
  source_views    INTEGER DEFAULT 0
);

INSERT INTO cyberpulse_incidents_v2 SELECT * FROM cyberpulse_incidents;
DROP TABLE cyberpulse_incidents;
ALTER TABLE cyberpulse_incidents_v2 RENAME TO cyberpulse_incidents;

CREATE INDEX IF NOT EXISTS idx_cp_discovered ON cyberpulse_incidents(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_severity ON cyberpulse_incidents(severity);
CREATE INDEX IF NOT EXISTS idx_cp_type ON cyberpulse_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_cp_platform ON cyberpulse_incidents(source_platform);
CREATE INDEX IF NOT EXISTS idx_cp_actor ON cyberpulse_incidents(threat_actor);
CREATE INDEX IF NOT EXISTS idx_cp_victim ON cyberpulse_incidents(victim_name);
CREATE INDEX IF NOT EXISTS idx_cp_sector ON cyberpulse_incidents(victim_sector);
CREATE INDEX IF NOT EXISTS idx_cp_dedup ON cyberpulse_incidents(dedup_hash);
CREATE INDEX IF NOT EXISTS idx_cp_country ON cyberpulse_incidents(victim_country);
