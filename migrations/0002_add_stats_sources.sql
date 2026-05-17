-- Migration number: 0002 	 2026-05-16T19:15:00.000Z

ALTER TABLE briefings ADD COLUMN stats_json   TEXT NOT NULL DEFAULT '{}';
ALTER TABLE briefings ADD COLUMN sources_json TEXT NOT NULL DEFAULT '[]';
