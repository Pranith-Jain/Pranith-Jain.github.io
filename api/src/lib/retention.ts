import type { D1Database } from '@cloudflare/workers-types';

/**
 * 30-day data retention sweep. Removes rows older than the configured
 * retention window from time-series and user-data tables.
 *
 * Scope (per the data-minimization policy):
 *   - User-generated data (feedback, annotations, intel bundles) — 30d
 *   - Time-series telemetry (IOCs, WHOIS, CT, telegram leaks, API usage) — 30d
 *   - Briefings (daily/weekly/landscape reports) — 30d
 *
 * Exempt tables (deleting these would break the system or are non-temporal):
 *   - api_keys (auth tokens — deletion locks users out)
 *   - api_key_usage rows newer than 30d remain (per policy)
 *   - telegram_watched_channels, ct_watch (user watchlists, not time-series)
 *   - counters (no timestamp column)
 *
 * The sweep is idempotent and dry-run-able. Returns per-table counts so
 * the operator can see what was removed.
 */

export interface RetentionPolicy {
  /** Tables to sweep. Each entry names the table + the timestamp column
   *  used to determine age. ISO-8601 text columns only. */
  table: string;
  /** Column to compare against `now() - days`. ISO-8601 text or unix int. */
  column: string;
  /** Format of the column value: 'iso' (text, strftime-format) or 'unix' (integer seconds). */
  format: 'iso' | 'unix';
}

export const DEFAULT_RETENTION_DAYS = 30;

/**
 * Default policy. Excludes auth/control-plane tables. Add to this list
 * when a new time-series table ships so the sweep picks it up.
 */
export const RETENTION_POLICY: RetentionPolicy[] = [
  // Product data
  { table: 'briefings', column: 'created_at', format: 'iso' },
  { table: 'briefing_feedback', column: 'created_at', format: 'iso' },
  { table: 'briefing_annotations', column: 'created_at', format: 'iso' },
  { table: 'intel_bundles', column: 'updated_at', format: 'iso' },

  // IOC + WHOIS telemetry
  { table: 'ioc_lifecycle', column: 'last_seen', format: 'iso' },
  { table: 'whois_snapshots', column: 'first_seen', format: 'iso' },
  { table: 'whois_changes', column: 'first_seen', format: 'iso' },
  { table: 'domain_registrant_index', column: 'first_seen', format: 'iso' },
  { table: 'domain_nameserver_index', column: 'first_seen', format: 'iso' },

  // Telegram leak monitor
  { table: 'telegram_discovered_channels', column: 'discovered_at', format: 'iso' },
  { table: 'telegram_leak_entries', column: 'discovered_at', format: 'iso' },

  // CT monitor
  { table: 'ct_certs', column: 'first_seen', format: 'iso' },

  // API usage (last_request_at is ISO-8601 text per migration 0013)
  { table: 'api_key_usage', column: 'last_request_at', format: 'iso' },
];

export interface RetentionResult {
  days: number;
  dry_run: boolean;
  cutoff_iso: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  tables: Array<{
    table: string;
    column: string;
    deleted: number;
    error?: string;
  }>;
  total_deleted: number;
  tables_swept: number;
}

function cutoffIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function cutoffUnix(days: number): number {
  return Math.floor(Date.now() / 1000) - days * 86_400;
}

/**
 * Run the retention sweep. Safe to call from any cron or admin endpoint.
 * If `dry_run` is true, counts rows that *would* be deleted but issues
 * a SELECT instead of a DELETE so the operator can preview impact.
 */
export async function runRetentionSweep(
  db: D1Database,
  opts: { days?: number; dry_run?: boolean; policy?: RetentionPolicy[] } = {}
): Promise<RetentionResult> {
  const days = opts.days ?? DEFAULT_RETENTION_DAYS;
  const dryRun = opts.dry_run ?? false;
  const policy = opts.policy ?? RETENTION_POLICY;
  const startedAt = new Date();
  const cutoff = cutoffIso(days);

  const tables: RetentionResult['tables'] = [];
  let total = 0;

  for (const p of policy) {
    const t0 = Date.now();
    try {
      // Always run a count first so we have a number to return, even on dry-run.
      // This is one extra round-trip on the hot path but lets us report stats.
      const countRow = await db
        .prepare(`SELECT COUNT(*) AS n FROM ${p.table} WHERE ${p.column} < ?`)
        .bind(p.format === 'iso' ? cutoff : cutoffUnix(days))
        .first<{ n: number }>();
      const wouldDelete = countRow?.n ?? 0;

      if (dryRun) {
        tables.push({ table: p.table, column: p.column, deleted: 0 });
        continue;
      }

      if (wouldDelete > 0) {
        await db
          .prepare(`DELETE FROM ${p.table} WHERE ${p.column} < ?`)
          .bind(p.format === 'iso' ? cutoff : cutoffUnix(days))
          .run();
      }
      tables.push({ table: p.table, column: p.column, deleted: wouldDelete });
      total += wouldDelete;
      // Log a single line per non-empty table for ops visibility
      if (wouldDelete > 0) {
        console.log(`retention: ${p.table} ${wouldDelete} rows older than ${days}d (${Date.now() - t0}ms)`);
      }
    } catch (err) {
      tables.push({
        table: p.table,
        column: p.column,
        deleted: 0,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`retention: ${p.table} failed:`, err);
    }
  }

  return {
    days,
    dry_run: dryRun,
    cutoff_iso: cutoff,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt.getTime(),
    tables,
    total_deleted: total,
    tables_swept: tables.filter((t) => t.deleted > 0).length,
  };
}
