-- Migration number: 0018 	 2026-06-08T00:00:00.000Z
-- Add missing indexes for retention sweep and query optimization.

-- briefing_feedback: retention sweep does WHERE created_at < ? (full table scan without this)
CREATE INDEX IF NOT EXISTS idx_briefing_feedback_created ON briefing_feedback(created_at);

-- briefing_annotations: retention sweep does WHERE created_at < ? (full table scan without this)
CREATE INDEX IF NOT EXISTS idx_briefing_annotations_created ON briefing_annotations(created_at);

-- breach_forum_status: span detection groups by (name, source, observed_at DESC)
CREATE INDEX IF NOT EXISTS idx_breach_forum_status_name_source ON breach_forum_status(name, source, observed_at DESC);
