-- Dark web monitoring: keyword watchers + alert log

CREATE TABLE IF NOT EXISTS darkweb_monitors (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  engines TEXT NOT NULL DEFAULT 'ahmia,onionland,tor66',
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_checked_at TEXT,
  last_alert_at TEXT,
  alert_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_dw_monitors_enabled ON darkweb_monitors(enabled);
CREATE INDEX IF NOT EXISTS idx_dw_monitors_keyword ON darkweb_monitors(keyword);

CREATE TABLE IF NOT EXISTS darkweb_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  engine TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  found_at TEXT NOT NULL,
  FOREIGN KEY (monitor_id) REFERENCES darkweb_monitors(id)
);

CREATE INDEX IF NOT EXISTS idx_dw_alerts_monitor ON darkweb_alerts(monitor_id);
CREATE INDEX IF NOT EXISTS idx_dw_alerts_found ON darkweb_alerts(found_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dw_alerts_dedup ON darkweb_alerts(monitor_id, url);
