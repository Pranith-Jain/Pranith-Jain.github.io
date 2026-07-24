-- Migration 0038: Investigation Memory
-- Persist key IOCs, actors, and patterns across sessions for cross-investigation context.

CREATE TABLE IF NOT EXISTS investigation_memory (
  id              TEXT PRIMARY KEY,
  query           TEXT NOT NULL,
  query_type      TEXT NOT NULL DEFAULT 'generic',
  iocs            TEXT NOT NULL DEFAULT '[]',
  actors          TEXT NOT NULL DEFAULT '[]',
  mitre           TEXT NOT NULL DEFAULT '[]',
  cves            TEXT NOT NULL DEFAULT '[]',
  key_findings    TEXT NOT NULL DEFAULT '[]',
  quality_score   INTEGER NOT NULL DEFAULT 0,
  model_used      TEXT NOT NULL DEFAULT '',
  completed_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_investigation_memory_query ON investigation_memory(query);
CREATE INDEX IF NOT EXISTS idx_investigation_memory_completed_at ON investigation_memory(completed_at);
CREATE INDEX IF NOT EXISTS idx_investigation_memory_query_type ON investigation_memory(query_type);
