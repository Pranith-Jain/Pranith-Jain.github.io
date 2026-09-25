-- Procedure-extraction jobs + analyst review gates (edge-native).
--
-- Upstream netandneedle/procedure-extraction-pipeline keeps queue state +
-- LangGraph checkpoints in Postgres and the graph in Neo4j. On the edge we
-- keep the durable queue in D1 (JSON checkpoints as TEXT, like
-- intel_bundles.view_json) and learned rules as a versioned static asset
-- (public/data/procedures/rules.json) with D1 overrides only for approvals.
-- Forward-only: never edit; review decisions append rows.
CREATE TABLE IF NOT EXISTS procedure_jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'free_text',
  status TEXT NOT NULL DEFAULT 'queued',
  gates TEXT NOT NULL DEFAULT '{"entities":true,"chunks":true,"procedures":true,"bundle":true}',
  gate_modes TEXT NOT NULL DEFAULT '{}',
  is_sequential TEXT NOT NULL DEFAULT 'auto',
  source_text TEXT NOT NULL DEFAULT '',
  checkpoints TEXT NOT NULL DEFAULT '{}',
  extraction TEXT NOT NULL DEFAULT '{}',
  corrections TEXT NOT NULL DEFAULT '[]',
  bundle_json TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_procedure_jobs_status ON procedure_jobs(status, created_at);

-- Per-gate analyst decisions (gates 0/entities, chunks, 1/procedures, 2/bundle).
CREATE TABLE IF NOT EXISTS procedure_reviews (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  gate TEXT NOT NULL,
  decision TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  reviewer TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_procedure_reviews_job ON procedure_reviews(job_id, gate);

-- Promotable learned rules (analyst corrections → guardrails). Served read-only;
-- the static asset is the default, this table holds approved overrides.
CREATE TABLE IF NOT EXISTS procedure_rules (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'general',
  pattern TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  hits INTEGER NOT NULL DEFAULT 0,
  misses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_procedure_rules_status ON procedure_rules(status, category);
