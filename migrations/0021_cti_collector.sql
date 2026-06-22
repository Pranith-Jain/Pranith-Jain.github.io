-- Migration 0021: CTI Collector — IOC ingestion with decay scoring, AI predictions, attack mutations
-- VHunt-inspired: automated multi-source collection, 30-day retention, decay scoring

-- Collected IOCs from automated feeds (abuse.ch, NVD, CISA KEV, RSS news)
CREATE TABLE IF NOT EXISTS cti_iocs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  value TEXT NOT NULL,
  type TEXT NOT NULL,            -- ip, domain, url, hash, email
  source TEXT NOT NULL,          -- threatfox, urlhaus, malwarebazaar, feodo, sslbl, openphish, nvd, cisa_kev
  confidence INTEGER DEFAULT 50,
  malware_family TEXT DEFAULT '',
  threat_actor TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  raw_json TEXT DEFAULT '{}',
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  observation_count INTEGER DEFAULT 1,
  decay_score REAL DEFAULT 1.0,  -- 1.0 = fresh, 0.0 = stale
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cti_iocs_value ON cti_iocs(value);
CREATE INDEX IF NOT EXISTS idx_cti_iocs_type ON cti_iocs(type);
CREATE INDEX IF NOT EXISTS idx_cti_iocs_source ON cti_iocs(source);
CREATE INDEX IF NOT EXISTS idx_cti_iocs_last_seen ON cti_iocs(last_seen);
CREATE INDEX IF NOT EXISTS idx_cti_iocs_decay ON cti_iocs(decay_score DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cti_iocs_unique ON cti_iocs(value, source);

-- Collected news articles from security RSS feeds
CREATE TABLE IF NOT EXISTS cti_news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  url TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  source TEXT NOT NULL,          -- bleepingcomputer, hackernews, darkreading, etc.
  published TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cti_news_source ON cti_news(source);
CREATE INDEX IF NOT EXISTS idx_cti_news_fetched ON cti_news(fetched_at);

-- AI-generated attack predictions
CREATE TABLE IF NOT EXISTS cti_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prediction_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  threat_level TEXT NOT NULL DEFAULT 'MEDIUM',  -- CRITICAL, HIGH, MEDIUM, LOW
  confidence INTEGER DEFAULT 50,
  summary TEXT DEFAULT '',
  attack_flow TEXT DEFAULT '[]',    -- JSON array of phases
  target_sectors TEXT DEFAULT '[]',
  target_regions TEXT DEFAULT '[]',
  mitre_techniques TEXT DEFAULT '[]',
  malware_evolution TEXT DEFAULT '',
  novel_aspects TEXT DEFAULT '[]',
  indicators_to_watch TEXT DEFAULT '{}',
  defensive_recommendations TEXT DEFAULT '[]',
  reasoning TEXT DEFAULT '',
  based_on_sources TEXT DEFAULT '[]',
  date_range_start TEXT DEFAULT '',
  date_range_end TEXT DEFAULT '',
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_cti_predictions_generated ON cti_predictions(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cti_predictions_threat ON cti_predictions(threat_level);

-- Mutation engine: seed attacks and generated variants
CREATE TABLE IF NOT EXISTS cti_mutation_seeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seed_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  seed_type TEXT DEFAULT 'custom',  -- campaign, malware, cve, ttp_chain, threat_actor, custom
  raw_input TEXT DEFAULT '',
  phases TEXT DEFAULT '[]',        -- JSON array of kill chain phases
  source_refs TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS cti_mutation_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id TEXT UNIQUE NOT NULL,
  seed_id TEXT NOT NULL,
  title TEXT NOT NULL,
  mutation_type TEXT DEFAULT 'phase_swap',
  threat_level TEXT DEFAULT 'HIGH',
  novelty_score INTEGER DEFAULT 0,
  danger_score INTEGER DEFAULT 0,
  plausibility INTEGER DEFAULT 0,
  combined_score INTEGER DEFAULT 0,
  summary TEXT DEFAULT '',
  phases TEXT DEFAULT '[]',
  mitre_chain TEXT DEFAULT '[]',
  what_changed TEXT DEFAULT '[]',
  why_dangerous TEXT DEFAULT '',
  detection_gaps TEXT DEFAULT '[]',
  defensive_actions TEXT DEFAULT '[]',
  attack_walkthrough TEXT DEFAULT '[]',
  defense_playbook TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  FOREIGN KEY(seed_id) REFERENCES cti_mutation_seeds(seed_id)
);

CREATE INDEX IF NOT EXISTS idx_cti_mutation_variants_seed ON cti_mutation_variants(seed_id);
CREATE INDEX IF NOT EXISTS idx_cti_mutation_variants_score ON cti_mutation_variants(combined_score DESC);

-- Collection job tracking (when each source was last fetched, success/failure)
CREATE TABLE IF NOT EXISTS cti_collection_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, running, success, failed
  items_collected INTEGER DEFAULT 0,
  error_message TEXT DEFAULT '',
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  completed_at TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_cti_jobs_source ON cti_collection_jobs(source);
CREATE INDEX IF NOT EXISTS idx_cti_jobs_started ON cti_collection_jobs(started_at DESC);
