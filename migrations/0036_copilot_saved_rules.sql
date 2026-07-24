-- Migration 0036: Copilot Saved Detection Rules
-- Persist detection rules generated from the Investigation Copilot

CREATE TABLE IF NOT EXISTS copilot_saved_rules (
  id          TEXT PRIMARY KEY,
  session_id  TEXT,
  rule_type   TEXT NOT NULL CHECK(rule_type IN ('yara', 'sigma', 'kql', 'splunk', 'lucene', 'eql', 'snort', 'powershell', 'dlp', 'supplychain')),
  rule_name   TEXT NOT NULL DEFAULT '',
  rule_content TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  context     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_copilot_saved_rules_type ON copilot_saved_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_copilot_saved_rules_created ON copilot_saved_rules(created_at);
