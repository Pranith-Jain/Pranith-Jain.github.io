-- Migration number: 0004 	 2026-05-18T05:00:00.000Z
--
-- Global counters (currently just the site view count). Replaces the
-- per-browser localStorage tally that rendered as a global "N views" but
-- differed on every device/session — see routes/pageviews.ts.

CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  n   INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO counters (key, n) VALUES ('site_views', 0);
