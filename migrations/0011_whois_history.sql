-- WHOIS History tracking for domain ownership analysis.
--
-- Stores historical WHOIS/RDAP snapshots to enable:
--   1. Ownership change detection over time
--   2. Pivoting across domains by shared registrant attributes
--   3. Infrastructure fingerprinting (shared nameservers, registrar patterns)
--
-- Inspired by etugen.io's WHOIS History Explorer feature.

CREATE TABLE IF NOT EXISTS whois_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  domain          TEXT NOT NULL,
  -- Registrant / registration data
  registrar       TEXT,
  registrant_name TEXT,
  registrant_org  TEXT,
  registrant_email TEXT,
  registrant_phone TEXT,
  -- Registration dates
  created_date    TEXT,
  expires_date    TEXT,
  updated_date    TEXT,
  -- Infrastructure
  nameservers     TEXT DEFAULT '[]',   -- JSON array of nameserver hostnames
  dnssec          TEXT,
  status          TEXT DEFAULT '[]',   -- JSON array of domain statuses
  -- Metadata
  source          TEXT NOT NULL DEFAULT 'rdap',  -- 'rdap', 'whois-tcp', 'api', 'manual'
  snapshot_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  -- Change detection
  fingerprint     TEXT,   -- SHA-256 hash of key fields for fast change detection
  UNIQUE(domain, fingerprint)
);

CREATE INDEX idx_whois_snapshots_domain ON whois_snapshots(domain, snapshot_at DESC);
CREATE INDEX idx_whois_snapshots_email ON whois_snapshots(registrant_email, snapshot_at DESC);
CREATE INDEX idx_whois_snapshots_org ON whois_snapshots(registrant_org, snapshot_at DESC);
CREATE INDEX idx_whois_snapshots_registrar ON whois_snapshots(registrar, snapshot_at DESC);
CREATE INDEX idx_whois_snapshots_fingerprint ON whois_snapshots(fingerprint);

-- Domain ownership change events.
-- Generated when a new snapshot differs from the previous one.
CREATE TABLE IF NOT EXISTS whois_changes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  domain          TEXT NOT NULL,
  change_type     TEXT NOT NULL,  -- 'registrant', 'registrar', 'nameservers', 'status', 'dates'
  field_name      TEXT NOT NULL,
  old_value       TEXT,
  new_value       TEXT,
  detected_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  snapshot_id     INTEGER REFERENCES whois_snapshots(id)
);

CREATE INDEX idx_whois_changes_domain ON whois_changes(domain, detected_at DESC);

-- Pivot index: domains sharing the same registrant email.
-- Materialized view-like table for fast pivot queries.
CREATE TABLE IF NOT EXISTS domain_registrant_index (
  domain          TEXT NOT NULL,
  registrant_email TEXT NOT NULL,
  registrant_org  TEXT,
  registrant_name TEXT,
  first_seen      TEXT NOT NULL,
  last_seen       TEXT NOT NULL,
  snapshot_count  INTEGER DEFAULT 1,
  PRIMARY KEY (domain, registrant_email)
);

CREATE INDEX idx_dri_email ON domain_registrant_index(registrant_email);
CREATE INDEX idx_dri_org ON domain_registrant_index(registrant_org);

-- Pivot index: domains sharing the same nameservers.
CREATE TABLE IF NOT EXISTS domain_nameserver_index (
  domain          TEXT NOT NULL,
  nameserver      TEXT NOT NULL,
  first_seen      TEXT NOT NULL,
  last_seen       TEXT NOT NULL,
  PRIMARY KEY (domain, nameserver)
);

CREATE INDEX idx_dni_ns ON domain_nameserver_index(nameserver);
