-- Migration 0008: Certificate Transparency Domain Monitor
-- Tracks watched domains and certificates from CT logs.

CREATE TABLE IF NOT EXISTS ct_watch (
  domain TEXT PRIMARY KEY,
  alert_types TEXT DEFAULT '["new_subdomain","suspicious_name","wildcard"]',
  added_at TEXT NOT NULL,
  last_checked TEXT,
  cert_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ct_certs (
  id INTEGER,
  domain TEXT NOT NULL,
  common_name TEXT,
  names TEXT,
  issuer TEXT,
  not_before TEXT,
  not_after TEXT,
  serial TEXT,
  first_seen TEXT NOT NULL,
  alert_type TEXT,
  alert_message TEXT,
  PRIMARY KEY (domain, id)
);

CREATE INDEX IF NOT EXISTS idx_ct_certs_domain ON ct_certs(domain);
CREATE INDEX IF NOT EXISTS idx_ct_certs_first_seen ON ct_certs(first_seen);
CREATE INDEX IF NOT EXISTS idx_ct_certs_alert ON ct_certs(alert_type);
