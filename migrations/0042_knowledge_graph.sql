-- Migration 0042: Cross-investigation knowledge graph
-- Aggregates entities and relationships across investigations into a growing
-- knowledge base. Observation/weight counts reflect how often each is seen.

CREATE TABLE IF NOT EXISTS knowledge_entities (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  label        TEXT NOT NULL,
  first_seen   TEXT NOT NULL,
  last_seen    TEXT NOT NULL,
  observations INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL,
  target       TEXT NOT NULL,
  relationship TEXT NOT NULL,
  confidence   TEXT NOT NULL DEFAULT 'medium',
  weight       INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_knowledge_entities_obs ON knowledge_entities(observations);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_weight ON knowledge_edges(weight);
CREATE INDEX IF NOT EXISTS idx_knowledge_edges_source ON knowledge_edges(source);
