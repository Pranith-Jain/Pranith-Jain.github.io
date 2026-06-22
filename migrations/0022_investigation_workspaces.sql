-- Migration 0022: Investigation Workspaces
-- AEAD lifecycle workspaces with subjects, connections, findings, and exposure scores.
-- Inspired by CTI Expert's case management model.

CREATE TABLE IF NOT EXISTS investigation_workspaces (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  target          TEXT NOT NULL DEFAULT '',
  target_type     TEXT NOT NULL DEFAULT 'domain' CHECK(target_type IN ('person','domain','org','username','email','ip','other')),
  phase           TEXT NOT NULL DEFAULT 'acquire' CHECK(phase IN ('acquire','enrich','assess','deliver','complete')),
  status          TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','active','archived')),
  exposure_score  INTEGER DEFAULT 0 CHECK(exposure_score >= 0 AND exposure_score <= 100),
  exposure_label  TEXT NOT NULL DEFAULT 'Unknown',
  tags            TEXT NOT NULL DEFAULT '[]',
  metadata        TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ws_status ON investigation_workspaces(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ws_phase ON investigation_workspaces(phase);
CREATE INDEX IF NOT EXISTS idx_ws_target ON investigation_workspaces(target);

CREATE TABLE IF NOT EXISTS ws_subjects (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES investigation_workspaces(id) ON DELETE CASCADE,
  subject_type  TEXT NOT NULL CHECK(subject_type IN ('person','domain','org','username','email','ip','phone','location','asset','event','device','image','crypto','custom')),
  label         TEXT NOT NULL,
  value         TEXT NOT NULL DEFAULT '',
  confidence    INTEGER DEFAULT 50 CHECK(confidence >= 0 AND confidence <= 100),
  trust_score   INTEGER DEFAULT 3 CHECK(trust_score >= 1 AND trust_score <= 5),
  verified      INTEGER NOT NULL DEFAULT 0,
  aliases       TEXT NOT NULL DEFAULT '[]',
  notes         TEXT NOT NULL DEFAULT '',
  first_seen    TEXT DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ws_subjects_ws ON ws_subjects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ws_subjects_type ON ws_subjects(subject_type);

CREATE TABLE IF NOT EXISTS ws_connections (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES investigation_workspaces(id) ON DELETE CASCADE,
  from_subject_id TEXT NOT NULL REFERENCES ws_subjects(id) ON DELETE CASCADE,
  to_subject_id   TEXT NOT NULL REFERENCES ws_subjects(id) ON DELETE CASCADE,
  relationship    TEXT NOT NULL DEFAULT 'linked_to',
  strength        TEXT NOT NULL DEFAULT 'confirmed' CHECK(strength IN ('confirmed','probable','possible')),
  notes           TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ws_conn_ws ON ws_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ws_conn_from ON ws_connections(from_subject_id);
CREATE INDEX IF NOT EXISTS idx_ws_conn_to ON ws_connections(to_subject_id);

CREATE TABLE IF NOT EXISTS ws_findings (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL REFERENCES investigation_workspaces(id) ON DELETE CASCADE,
  subject_id      TEXT REFERENCES ws_subjects(id) ON DELETE SET NULL,
  finding_type    TEXT NOT NULL DEFAULT 'infrastructure',
  weight          TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(weight IN ('CRITICAL','HIGH','MEDIUM','LOW','INFO')),
  description     TEXT NOT NULL,
  source_url      TEXT NOT NULL DEFAULT '',
  source_reliability TEXT DEFAULT 'C' CHECK(source_reliability IN ('A','B','C','D','E','F')),
  confidence      INTEGER DEFAULT 50 CHECK(confidence >= 0 AND confidence <= 100),
  trust_score     INTEGER DEFAULT 3 CHECK(trust_score >= 1 AND trust_score <= 5),
  collection_method TEXT NOT NULL DEFAULT 'search',
  tags            TEXT NOT NULL DEFAULT '[]',
  validated       INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ws_findings_ws ON ws_findings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ws_findings_subject ON ws_findings(subject_id);
CREATE INDEX IF NOT EXISTS idx_ws_findings_weight ON ws_findings(weight);

CREATE TABLE IF NOT EXISTS ws_timeline (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  TEXT NOT NULL REFERENCES investigation_workspaces(id) ON DELETE CASCADE,
  event_date    TEXT NOT NULL,
  event_type    TEXT NOT NULL DEFAULT 'observation',
  description   TEXT NOT NULL,
  subject_id    TEXT REFERENCES ws_subjects(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ws_timeline_ws ON ws_timeline(workspace_id, event_date);
