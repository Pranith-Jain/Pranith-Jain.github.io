-- Migration 0039: Confidence Calibration
-- Track prediction accuracy to improve future confidence assessments.

CREATE TABLE IF NOT EXISTS confidence_calibration (
  id                    TEXT PRIMARY KEY,
  query                 TEXT NOT NULL,
  predicted_confidence  TEXT NOT NULL CHECK(predicted_confidence IN ('high', 'medium', 'low')),
  actual_outcome        TEXT NOT NULL CHECK(actual_outcome IN ('correct', 'partial', 'incorrect')),
  quality_score         INTEGER NOT NULL DEFAULT 0,
  model_used            TEXT NOT NULL DEFAULT '',
  recorded_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_confidence_calibration_query ON confidence_calibration(query);
CREATE INDEX IF NOT EXISTS idx_confidence_calibration_recorded_at ON confidence_calibration(recorded_at);
CREATE INDEX IF NOT EXISTS idx_confidence_calibration_predicted ON confidence_calibration(predicted_confidence);
