CREATE TABLE IF NOT EXISTS telegram_watched_channels (
  handle      TEXT PRIMARY KEY,
  title       TEXT,
  category    TEXT NOT NULL DEFAULT 'auto-discovered',
  discovered_from TEXT,
  added_by    TEXT NOT NULL DEFAULT 'auto',
  added_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_scraped TEXT,
  last_leak_found TEXT,
  message_count INTEGER DEFAULT 0,
  leak_count  INTEGER DEFAULT 0,
  active      INTEGER DEFAULT 1,
  tags        TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS telegram_discovered_channels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  handle      TEXT NOT NULL,
  source_message TEXT,
  discovered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  reviewed    INTEGER DEFAULT 0,
  added_to_watch INTEGER DEFAULT 0,
  UNIQUE(handle, source_message)
);

CREATE TABLE IF NOT EXISTS telegram_leak_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_handle TEXT NOT NULL,
  message_link  TEXT,
  message_text  TEXT,
  leak_type   TEXT NOT NULL DEFAULT 'unknown',
  credential_count INTEGER DEFAULT 0,
  file_url    TEXT,
  file_name   TEXT,
  domains_found TEXT DEFAULT '[]',
  severity    TEXT DEFAULT 'medium',
  discovered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  raw_content TEXT
);

CREATE INDEX idx_leak_entries_channel ON telegram_leak_entries(channel_handle);
CREATE INDEX idx_leak_entries_discovered ON telegram_leak_entries(discovered_at DESC);
CREATE INDEX idx_leak_entries_severity ON telegram_leak_entries(severity);
CREATE INDEX idx_discovered_channels_handle ON telegram_discovered_channels(handle);
CREATE INDEX idx_watched_channels_active ON telegram_watched_channels(active);
