-- Migration 0043: Route-handler tables (formerly created via per-request ensureTable())
-- These tables were created lazily by ensureTable()/ensureTables() DDL run on
-- every request in copilot-chat.ts, vera.ts, and investigations.ts. The per-request
-- DDL is being removed; this migration is the single source of truth.
--
-- On existing databases the tables already exist (created by the old lazy DDL),
-- so CREATE TABLE IF NOT EXISTS is a no-op. On fresh databases the migration
-- creates them before the first request.

CREATE TABLE IF NOT EXISTS copilot_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vera_sessions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'ask',
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  role TEXT DEFAULT 'cti'
);

CREATE TABLE IF NOT EXISTS investigations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'medium',
  tlp TEXT NOT NULL DEFAULT 'amber',
  status TEXT NOT NULL DEFAULT 'open',
  tags TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investigation_observables (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  value TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  tags TEXT DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investigation_tasks (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investigation_timeline (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inv_obs_inv ON investigation_observables(investigation_id);
CREATE INDEX IF NOT EXISTS idx_inv_tasks_inv ON investigation_tasks(investigation_id);
CREATE INDEX IF NOT EXISTS idx_inv_timeline_inv ON investigation_timeline(investigation_id);
