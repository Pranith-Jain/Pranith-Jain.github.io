-- Migration 0020: Investigation Notebooks
-- Persistent markdown notes + IOC snapshots for DFIR investigations.

CREATE TABLE IF NOT EXISTS investigation_notebooks (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'investigating', 'resolved', 'archived')),
  tags        TEXT NOT NULL DEFAULT '[]',
  severity    TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'low', 'medium', 'high', 'critical')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notebooks_status ON investigation_notebooks(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notebooks_updated ON investigation_notebooks(updated_at DESC);

CREATE TABLE IF NOT EXISTS notebook_entries (
  id           TEXT PRIMARY KEY,
  notebook_id  TEXT NOT NULL REFERENCES investigation_notebooks(id) ON DELETE CASCADE,
  entry_type   TEXT NOT NULL DEFAULT 'note' CHECK(entry_type IN ('note', 'ioc', 'finding', 'timeline', 'artifact')),
  content      TEXT NOT NULL,
  metadata     TEXT NOT NULL DEFAULT '{}',
  pinned       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notebook_entries_nb ON notebook_entries(notebook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notebook_entries_type ON notebook_entries(entry_type);
