-- Attack Surface Management tables
CREATE TABLE IF NOT EXISTS asm_domains (
  id TEXT PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_scan TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'error'))
);

CREATE TABLE IF NOT EXISTS asm_assets (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES asm_domains(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('subdomain', 'ip', 'certificate', 'port', 'technology')),
  value TEXT NOT NULL,
  metadata TEXT,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'changed', 'removed', 'stable')),
  UNIQUE(domain_id, value)
);

CREATE TABLE IF NOT EXISTS asm_changes (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES asm_domains(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('asset_added', 'asset_removed', 'asset_changed', 'new_subdomain', 'cert_expiry', 'dns_change')),
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('high', 'medium', 'low')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  details TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_asm_assets_domain ON asm_assets(domain_id);
CREATE INDEX IF NOT EXISTS idx_asm_assets_type ON asm_assets(type);
CREATE INDEX IF NOT EXISTS idx_asm_assets_status ON asm_assets(status);
CREATE INDEX IF NOT EXISTS idx_asm_changes_domain ON asm_changes(domain_id);
CREATE INDEX IF NOT EXISTS idx_asm_changes_created ON asm_changes(created_at);
CREATE INDEX IF NOT EXISTS idx_asm_changes_severity ON asm_changes(severity);
