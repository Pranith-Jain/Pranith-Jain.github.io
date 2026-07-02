/**
 * D1 Database Backup System
 *
 * Automated backup of critical D1 tables to KV for disaster recovery.
 * Runs on a daily cron and stores the latest 30 days of backups.
 *
 * Tables backed up:
 *   - briefings (threat intel briefings)
 *   - api_keys (API key hashes)
 *   - whois_snapshots (WHOIS history)
 *   - briefing_feedback (analyst feedback)
 *   - telegram_leak_entries (leak monitoring)
 *
 * Recovery: Read the KV backup and execute the SQL against a fresh D1 database.
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

interface BackupManifest {
  timestamp: string;
  tables: Record<string, { rows: number; size_bytes: number }>;
  total_rows: number;
  total_size_bytes: number;
}

const BACKUP_TABLES = [
  'briefings',
  'api_keys',
  'whois_snapshots',
  'briefing_feedback',
  'briefing_annotations',
  'telegram_leak_entries',
  'telegram_watched_channels',
  'telegram_discovered_channels',
  'whois_changes',
  'domain_registrant_index',
  'domain_nameserver_index',
];

const MAX_BACKUPS = 30; // Keep 30 days of backups
const BACKUP_PREFIX = 'd1-backup:';

/**
 * Export a D1 table to JSON lines format.
 */
async function exportTable(db: D1Database, tableName: string): Promise<{ data: string; rows: number }> {
  try {
    const result = await db.prepare(`SELECT * FROM ${tableName}`).all();
    const rows = result.results ?? [];
    const data = rows.map((row) => JSON.stringify(row)).join('\n');
    return { data, rows: rows.length };
  } catch (e) {
    console.warn(`d1-backup: failed to export ${tableName}: ${e instanceof Error ? e.message : String(e)}`);
    return { data: '', rows: 0 };
  }
}

/**
 * Run a full D1 backup to KV.
 * Returns the backup manifest with statistics.
 */
export async function runD1Backup(db: D1Database, kv: KVNamespace): Promise<BackupManifest> {
  const timestamp = new Date().toISOString();
  const dateKey = timestamp.slice(0, 10); // YYYY-MM-DD
  const manifest: BackupManifest = {
    timestamp,
    tables: {},
    total_rows: 0,
    total_size_bytes: 0,
  };

  // Export each table into ONE coalesced payload. Previously this wrote one KV
  // key per table (~11 writes/run); a single `:tables` key drops that to 1 write
  // — meaningful against the Free-plan ~1k-writes/day budget. The payload maps
  // table → JSON-lines so a restore can still pull an individual table.
  const tableData: Record<string, string> = {};
  for (const table of BACKUP_TABLES) {
    const { data, rows } = await exportTable(db, table);
    const sizeBytes = new TextEncoder().encode(data).length;

    manifest.tables[table] = { rows, size_bytes: sizeBytes };
    manifest.total_rows += rows;
    manifest.total_size_bytes += sizeBytes;
    if (rows > 0) tableData[table] = data;
  }

  // One write for all table data + one for the manifest (was N+1).
  if (Object.keys(tableData).length > 0) {
    await kv.put(`${BACKUP_PREFIX}${dateKey}:tables`, JSON.stringify(tableData), {
      expirationTtl: 86400 * MAX_BACKUPS,
    });
  }
  const manifestKey = `${BACKUP_PREFIX}${dateKey}:manifest`;
  await kv.put(manifestKey, JSON.stringify(manifest), { expirationTtl: 86400 * MAX_BACKUPS });

  // Cleanup old backups (beyond MAX_BACKUPS)
  await cleanupOldBackups(kv, dateKey);

  console.log(
    JSON.stringify({
      job: 'd1-backup',
      tables: Object.keys(manifest.tables).length,
      total_rows: manifest.total_rows,
      total_size_kb: Math.round(manifest.total_size_bytes / 1024),
    })
  );

  return manifest;
}

/**
 * Clean up backups older than MAX_BACKUPS days.
 */
async function cleanupOldBackups(kv: KVNamespace, currentDate: string): Promise<void> {
  try {
    const cutoff = new Date(currentDate);
    cutoff.setDate(cutoff.getDate() - MAX_BACKUPS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    // List all backup manifests
    // Hard cap on the page size so a runaway namespace (or a future bump
    // to MAX_BACKUPS) can't pin a Worker invocation. 30 days of manifests is
    // ~30 keys — 200 is generous slack.
    const list = await kv.list({ prefix: `${BACKUP_PREFIX}`, limit: 200 });
    for (const key of list.keys) {
      const dateMatch = key.name.match(/d1-backup:(\d{4}-\d{2}-\d{2})/);
      if (dateMatch?.[1] && dateMatch[1] < cutoffStr) {
        await kv.delete(key.name);
      }
    }
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Get the latest backup manifest.
 */
export async function getLatestBackup(kv: KVNamespace): Promise<BackupManifest | null> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${BACKUP_PREFIX}${today}:manifest`;
  const data = await kv.get(key, 'json');
  return data as BackupManifest | null;
}
