-- Migration 0041: Agent Metrics detail columns
-- Adds per-tool timing/status (for real latency aggregation) and a meta JSON
-- blob (for new-feature telemetry: parallel burst, self-correction delta,
-- findings/graph size, routing refinement). Backward compatible — both default
-- to empty so existing rows and pre-migration inserts keep working.

ALTER TABLE agent_metrics ADD COLUMN tool_timings TEXT NOT NULL DEFAULT '[]';
ALTER TABLE agent_metrics ADD COLUMN meta TEXT NOT NULL DEFAULT '{}';
