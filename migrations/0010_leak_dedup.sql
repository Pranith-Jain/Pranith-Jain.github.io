-- Add unique constraint for dedup across cron runs
CREATE UNIQUE INDEX IF NOT EXISTS idx_leak_entries_dedup
  ON telegram_leak_entries(channel_handle, message_link)
  WHERE message_link IS NOT NULL;

-- Add a cleanup index for TTL-based purges
CREATE INDEX IF NOT EXISTS idx_leak_entries_cleanup
  ON telegram_leak_entries(discovered_at);
