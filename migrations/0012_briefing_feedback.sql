-- Analyst feedback system for threat intelligence briefings.
--
-- Allows analysts to:
--   - Flag findings as false positive / high priority / verified
--   - Add notes and annotations to findings
--   - Track investigation status per finding
--   - Build analyst confidence over time

CREATE TABLE IF NOT EXISTS briefing_feedback (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  briefing_slug   TEXT NOT NULL,
  finding_hash    TEXT NOT NULL,       -- SHA-256 of finding content for dedup
  finding_text    TEXT NOT NULL,       -- Original finding text (truncated to 500 chars)
  
  -- Analyst feedback
  action          TEXT NOT NULL,       -- 'false_positive', 'high_priority', 'verified', 'investigating', 'resolved'
  analyst_note    TEXT,                -- Optional analyst annotation
  confidence      TEXT,                -- Analyst confidence: 'confirmed', 'probable', 'possible', 'doubtful'
  
  -- Metadata
  analyst_id      TEXT NOT NULL DEFAULT 'anonymous',  -- API key prefix or 'anonymous'
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  
  -- Dedup: one feedback per finding per analyst
  UNIQUE(briefing_slug, finding_hash, analyst_id)
);

CREATE TABLE IF NOT EXISTS briefing_annotations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  briefing_slug   TEXT NOT NULL,
  annotation_type TEXT NOT NULL,       -- 'note', 'context', 'action_item', 'link'
  content         TEXT NOT NULL,
  
  -- Metadata
  analyst_id      TEXT NOT NULL DEFAULT 'anonymous',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  
  -- Priority for action items
  priority        TEXT DEFAULT 'normal'  -- 'critical', 'high', 'normal', 'low'
);

-- Indexes for fast lookups
CREATE INDEX idx_feedback_briefing ON briefing_feedback(briefing_slug);
CREATE INDEX idx_feedback_action ON briefing_feedback(action);
CREATE INDEX idx_feedback_analyst ON briefing_feedback(analyst_id);
CREATE INDEX idx_annotations_briefing ON briefing_annotations(briefing_slug);
