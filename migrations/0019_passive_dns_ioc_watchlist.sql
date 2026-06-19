-- Migration 0019: Passive DNS + IOC Watchlist
-- Passive DNS: historical DNS observations for infrastructure tracking
-- IOC Watchlist: proactive alerting on any indicator type

-- Passive DNS observations — accumulates from multi-source queries
CREATE TABLE IF NOT EXISTS passive_dns_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL,
  query_type TEXT NOT NULL,
  resolved TEXT NOT NULL,
  rrtype TEXT NOT NULL DEFAULT 'A',
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(query, resolved, rrtype, source)
);
CREATE INDEX IF NOT EXISTS idx_pdns_query ON passive_dns_observations(query);
CREATE INDEX IF NOT EXISTS idx_pdns_resolved ON passive_dns_observations(resolved);
CREATE INDEX IF NOT EXISTS idx_pdns_query_type ON passive_dns_observations(query_type);
CREATE INDEX IF NOT EXISTS idx_pdns_last_seen ON passive_dns_observations(last_seen);

-- IOC watchlist — watched indicators with alert configuration
CREATE TABLE IF NOT EXISTS ioc_watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  indicator TEXT NOT NULL,
  indicator_type TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  alert_channel TEXT NOT NULL DEFAULT 'webhook',
  webhook_url TEXT,
  min_confidence INTEGER NOT NULL DEFAULT 50,
  source_filter TEXT NOT NULL DEFAULT '[]',
  tlp TEXT NOT NULL DEFAULT 'GREEN',
  added_at TEXT NOT NULL,
  last_checked TEXT,
  last_alerted TEXT,
  alert_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_ioc_watch_indicator ON ioc_watchlist(indicator, indicator_type);
CREATE INDEX IF NOT EXISTS idx_ioc_watch_last_checked ON ioc_watchlist(last_checked);

-- IOC watch alerts — triggered alert history
CREATE TABLE IF NOT EXISTS ioc_watch_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watch_id INTEGER NOT NULL,
  indicator TEXT NOT NULL,
  indicator_type TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '{}',
  detected_at TEXT NOT NULL,
  webhook_delivered INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ioc_watch_alerts_watch ON ioc_watch_alerts(watch_id);
CREATE INDEX IF NOT EXISTS idx_ioc_watch_alerts_indicator ON ioc_watch_alerts(indicator, indicator_type);
CREATE INDEX IF NOT EXISTS idx_ioc_watch_alerts_detected ON ioc_watch_alerts(detected_at);
