-- Migration 0044: Report sharing + MSSP branding (Fleet-parity)
ALTER TABLE saved_reports ADD COLUMN share_token TEXT;
ALTER TABLE saved_reports ADD COLUMN shared_at TEXT;
ALTER TABLE saved_reports ADD COLUMN branding_json TEXT;

CREATE INDEX IF NOT EXISTS idx_saved_reports_share_token ON saved_reports(share_token);
