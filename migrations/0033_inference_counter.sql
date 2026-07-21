-- Migration 0033: Create inference_counter table for cost tracking.
--
-- Tracks monthly LLM inference calls for the case-study pipeline. Used to
-- show session/period cost in the admin header and enforce optional spend caps.

CREATE TABLE IF NOT EXISTS inference_counter (
  month TEXT NOT NULL DEFAULT (strftime('%Y-%m', 'now')),
  calls INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_cents REAL NOT NULL DEFAULT 0.0,
  PRIMARY KEY (month)
);
