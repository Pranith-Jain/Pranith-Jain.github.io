CREATE TABLE IF NOT EXISTS weekly_reports (
  slug        TEXT PRIMARY KEY,
  week_start  TEXT NOT NULL,
  week_end    TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_week ON weekly_reports(week_start);

CREATE TABLE IF NOT EXISTS articles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL UNIQUE,
  published_date TEXT NOT NULL,
  source_type   TEXT NOT NULL DEFAULT 'news',
  summary       TEXT,
  feed_source   TEXT,
  collected_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_date DESC);

CREATE TABLE IF NOT EXISTS supply_chain_incidents (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  url            TEXT NOT NULL UNIQUE,
  ecosystem      TEXT NOT NULL DEFAULT 'other',
  attack_vector  TEXT NOT NULL DEFAULT 'other',
  severity       TEXT NOT NULL DEFAULT 'medium',
  status         TEXT NOT NULL DEFAULT 'active',
  threat_actor   TEXT,
  published_date TEXT NOT NULL,
  summary        TEXT,
  collected_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_supply_chain_published ON supply_chain_incidents(published_date DESC);
