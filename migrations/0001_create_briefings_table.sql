-- Migration number: 0001 	 2026-05-16T19:08:47.023Z

CREATE TABLE IF NOT EXISTS briefings (
  slug        TEXT PRIMARY KEY,
  type        TEXT NOT NULL,       -- 'daily' | 'weekly'
  title       TEXT NOT NULL,
  date        TEXT NOT NULL,       -- ISO YYYY-MM-DD
  date_range  TEXT NOT NULL,
  range_start TEXT NOT NULL,
  range_end   TEXT NOT NULL,
  body        TEXT NOT NULL,       -- full JSON briefing (Briefing interface)
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_briefings_type ON briefings(type);
CREATE INDEX idx_briefings_range_end ON briefings(range_end);
