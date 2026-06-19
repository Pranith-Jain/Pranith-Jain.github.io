/**
 * IOC Watchlist — proactive alerting on any indicator type.
 *
 * Generalizes the address-watch pattern (crypto addresses) to cover all
 * IOC types: IP, domain, URL, hash, CVE. When a watched IOC appears in
 * the live feed stream or is newly observed, push an alert via webhook.
 *
 * Flow:
 *   1. User adds IOC to watchlist (POST /api/v1/ioc-watchlist)
 *   2. Hourly cron sweep checks the live IOC stream + D1 lifecycle
 *      for any watched indicators
 *   3. New sightings trigger alerts stored in D1 + optional webhook
 *      delivery (Discord, Slack, Telegram bot, custom)
 *
 * Storage: D1 tables `ioc_watchlist` + `ioc_watch_alerts`
 * Cron: wired into scheduled.ts hourly sweep (after address-watches)
 */

import type { D1Database } from '@cloudflare/workers-types';
import { pinnedFetch } from './ssrf-guard';

// ── Types ───────────────────────────────────────────────────────────────

export type IocType = 'ip' | 'domain' | 'url' | 'hash' | 'cve' | 'email';

export type AlertChannel = 'webhook' | 'none';

export interface WatchlistEntry {
  id: number;
  /** The IOC value to watch (IP, domain, hash, etc.). */
  indicator: string;
  /** IOC type classification. */
  indicator_type: IocType;
  /** Human-readable label for this watch. */
  label: string;
  /** How to deliver alerts. */
  alert_channel: AlertChannel;
  /** Webhook URL (Discord, Slack, Telegram, custom). */
  webhook_url: string | null;
  /** Minimum confidence score to trigger alert (0-100). Default 50. */
  min_confidence: number;
  /** Only alert on these sources (empty = all sources). */
  source_filter: string[];
  /** TLP marking for the watch. */
  tlp: 'WHITE' | 'GREEN' | 'AMBER' | 'RED';
  /** ISO 8601. */
  added_at: string;
  /** ISO 8601 — last time the sweep checked this entry. */
  last_checked: string | null;
  /** ISO 8601 — last time an alert was triggered. */
  last_alerted: string | null;
  /** Number of alerts triggered. */
  alert_count: number;
  /** Free-form notes. */
  notes: string | null;
}

export interface WatchAlert {
  id: number;
  watch_id: number;
  indicator: string;
  indicator_type: IocType;
  /** The alert trigger details. */
  alert_type: 'new_sighting' | 'confidence_increase' | 'cross_feed_consensus' | 'new_source';
  /** Source that triggered the alert. */
  source: string;
  /** Confidence score at time of alert. */
  confidence: number;
  /** Context/metadata (JSON). */
  detail: string;
  /** ISO 8601. */
  detected_at: string;
  /** Whether webhook was successfully delivered. */
  webhook_delivered: boolean;
}

// ── D1 Schema ───────────────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS ioc_watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  indicator TEXT NOT NULL,
  indicator_type TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  alert_channel TEXT NOT NULL DEFAULT 'webhook',
  webhook_url TEXT,
  min_confidence INTEGER NOT NULL DEFAULT 50,
  source_filter TEXT NOT NULL DEFAULT '[]',
  tlp TEXT NOT NULL DEFAULT 'GREEN',
  added_at TEXT NOT NULL,
  last_checked TEXT,
  last_alerted TEXT,
  alert_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_ioc_watch_indicator ON ioc_watchlist(indicator, indicator_type);
CREATE INDEX IF NOT EXISTS idx_ioc_watch_last_checked ON ioc_watchlist(last_checked);

CREATE TABLE IF NOT EXISTS ioc_watch_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watch_id INTEGER NOT NULL,
  indicator TEXT NOT NULL,
  indicator_type TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL DEFAULT '{}',
  detected_at TEXT NOT NULL,
  webhook_delivered INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ioc_watch_alerts_watch ON ioc_watch_alerts(watch_id);
CREATE INDEX IF NOT EXISTS idx_ioc_watch_alerts_indicator ON ioc_watch_alerts(indicator, indicator_type);
CREATE INDEX IF NOT EXISTS idx_ioc_watch_alerts_detected ON ioc_watch_alerts(detected_at);
`;

export async function ensureWatchlistTables(db: D1Database): Promise<void> {
  for (const stmt of DDL.split(';')
    .map((s) => s.trim())
    .filter(Boolean))
    await db.prepare(stmt).run();
}

// ── CRUD Operations ─────────────────────────────────────────────────────

export async function addWatch(
  db: D1Database,
  entry: {
    indicator: string;
    indicator_type: IocType;
    label?: string;
    alert_channel?: AlertChannel;
    webhook_url?: string;
    min_confidence?: number;
    source_filter?: string[];
    tlp?: string;
    notes?: string;
  }
): Promise<WatchlistEntry> {
  await ensureWatchlistTables(db);
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT INTO ioc_watchlist (indicator, indicator_type, label, alert_channel, webhook_url, min_confidence, source_filter, tlp, added_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      entry.indicator.toLowerCase().trim(),
      entry.indicator_type,
      entry.label ?? '',
      entry.alert_channel ?? 'webhook',
      entry.webhook_url ?? null,
      entry.min_confidence ?? 50,
      JSON.stringify(entry.source_filter ?? []),
      entry.tlp ?? 'GREEN',
      now,
      entry.notes ?? null
    )
    .run();
  return {
    id: result.meta.last_row_id as number,
    indicator: entry.indicator.toLowerCase().trim(),
    indicator_type: entry.indicator_type,
    label: entry.label ?? '',
    alert_channel: entry.alert_channel ?? 'webhook',
    webhook_url: entry.webhook_url ?? null,
    min_confidence: entry.min_confidence ?? 50,
    source_filter: entry.source_filter ?? [],
    tlp: (entry.tlp as WatchlistEntry['tlp']) ?? 'GREEN',
    added_at: now,
    last_checked: null,
    last_alerted: null,
    alert_count: 0,
    notes: entry.notes ?? null,
  };
}

export async function listWatches(
  db: D1Database,
  opts: { type?: IocType; limit?: number } = {}
): Promise<WatchlistEntry[]> {
  await ensureWatchlistTables(db);
  const limit = Math.min(opts.limit ?? 100, 500);
  let sql = 'SELECT * FROM ioc_watchlist';
  const params: unknown[] = [];
  if (opts.type) {
    sql += ' WHERE indicator_type = ?';
    params.push(opts.type);
  }
  sql += ' ORDER BY added_at DESC LIMIT ?';
  params.push(limit);
  const result = await db.prepare(sql).bind(...params).all();
  return (result.results ?? []).map(rowToWatch);
}

export async function removeWatch(db: D1Database, id: number): Promise<boolean> {
  await ensureWatchlistTables(db);
  const result = await db.prepare('DELETE FROM ioc_watchlist WHERE id = ?').bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function getWatch(db: D1Database, id: number): Promise<WatchlistEntry | null> {
  await ensureWatchlistTables(db);
  const row = await db.prepare('SELECT * FROM ioc_watchlist WHERE id = ?').bind(id).first();
  return row ? rowToWatch(row) : null;
}

function rowToWatch(r: Record<string, unknown>): WatchlistEntry {
  return {
    id: r.id as number,
    indicator: r.indicator as string,
    indicator_type: r.indicator_type as IocType,
    label: (r.label as string) ?? '',
    alert_channel: (r.alert_channel as AlertChannel) ?? 'webhook',
    webhook_url: (r.webhook_url as string) ?? null,
    min_confidence: (r.min_confidence as number) ?? 50,
    source_filter: JSON.parse((r.source_filter as string) ?? '[]'),
    tlp: (r.tlp as WatchlistEntry['tlp']) ?? 'GREEN',
    added_at: r.added_at as string,
    last_checked: (r.last_checked as string) ?? null,
    last_alerted: (r.last_alerted as string) ?? null,
    alert_count: (r.alert_count as number) ?? 0,
    notes: (r.notes as string) ?? null,
  };
}

// ── Sweep Engine ────────────────────────────────────────────────────────

const SWEEP_BATCH = 20;

/**
 * The hourly sweep: check watched IOCs against the ioc_lifecycle table
 * for new sightings. Matches are compared against the watch's source
 * filter and minimum confidence threshold.
 */
export async function sweepWatchlist(
  db: D1Database,
  now: string
): Promise<{ checked: number; alerts: number; errors: string[] }> {
  await ensureWatchlistTables(db);
  const errors: string[] = [];
  let alertCount = 0;

  // Fetch watches ordered by last_checked (oldest first)
  const result = await db
    .prepare(
      `SELECT * FROM ioc_watchlist ORDER BY last_checked ASC NULLS FIRST LIMIT ?`
    )
    .bind(SWEEP_BATCH)
    .all();
  const watches = (result.results ?? []).map(rowToWatch);

  for (const watch of watches) {
    try {
      const sightings = await checkIocSightings(db, watch);
      for (const sighting of sightings) {
        // Store alert
        await db
          .prepare(
            `INSERT INTO ioc_watch_alerts (watch_id, indicator, indicator_type, alert_type, source, confidence, detail, detected_at, webhook_delivered)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
          )
          .bind(
            watch.id,
            watch.indicator,
            watch.indicator_type,
            sighting.alert_type,
            sighting.source,
            sighting.confidence,
            JSON.stringify(sighting.detail),
            now
          )
          .run();

        alertCount++;

        // Deliver webhook if configured
        if (watch.alert_channel === 'webhook' && watch.webhook_url) {
          const delivered = await deliverWebhook(watch, sighting, now);
          if (delivered) {
            await db
              .prepare(
                `UPDATE ioc_watch_alerts SET webhook_delivered = 1 WHERE watch_id = ? AND webhook_delivered = 0 AND detected_at = ?`
              )
              .bind(watch.id, now)
              .run();
          }
        }
      }

      // Update watch metadata
      await db
        .prepare(
          `UPDATE ioc_watchlist
           SET last_checked = ?,
               last_alerted = CASE WHEN ? > 0 THEN ? ELSE last_alerted END,
               alert_count = alert_count + ?
           WHERE id = ?`
        )
        .bind(now, alertCount, now, alertCount, watch.id)
        .run();
    } catch (e) {
      errors.push(`watch(${watch.id}:${watch.indicator}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { checked: watches.length, alerts: alertCount, errors };
}

interface IocSighting {
  alert_type: 'new_sighting' | 'confidence_increase' | 'cross_feed_consensus' | 'new_source';
  source: string;
  confidence: number;
  detail: Record<string, unknown>;
}

async function checkIocSightings(db: D1Database, watch: WatchlistEntry): Promise<IocSighting[]> {
  const sightings: IocSighting[] = [];

  // Check ioc_lifecycle for this indicator
  const lifecycle = await db
    .prepare(
      `SELECT indicator, indicator_type, first_seen, last_seen, current_score, observation_count,
              sources_seen, last_sources
       FROM ioc_lifecycle
       WHERE indicator = ? AND indicator_type = ?`
    )
    .bind(watch.indicator, watch.indicator_type)
    .first<{
      indicator: string;
      indicator_type: string;
      first_seen: string;
      last_seen: string;
      current_score: number;
      observation_count: number;
      sources_seen: string;
      last_sources: string;
    }>();

  if (!lifecycle) return sightings;

  const sourcesSeen: string[] = JSON.parse(lifecycle.sources_seen ?? '[]');
  const lastSources: string[] = JSON.parse(lifecycle.last_sources ?? '[]');

  // Apply source filter
  const relevantSources = watch.source_filter.length > 0
    ? lastSources.filter((s) => watch.source_filter.includes(s))
    : lastSources;

  if (relevantSources.length === 0) return sightings;

  // Check confidence threshold
  if (lifecycle.current_score < watch.min_confidence) return sightings;

  // Check if this is a new sighting (first time we see this IOC since last check)
  const isNewSighting = !watch.last_checked || new Date(lifecycle.last_seen) > new Date(watch.last_checked);
  if (isNewSighting && lifecycle.current_score >= watch.min_confidence) {
    for (const source of relevantSources) {
      sightings.push({
        alert_type: 'new_sighting',
        source,
        confidence: lifecycle.current_score,
        detail: {
          first_seen: lifecycle.first_seen,
          last_seen: lifecycle.last_seen,
          observation_count: lifecycle.observation_count,
          total_sources: sourcesSeen.length,
        },
      });
    }
  }

  // Check for cross-feed consensus (3+ sources)
  if (sourcesSeen.length >= 3 && lifecycle.current_score >= watch.min_confidence) {
    const isNewConsensus = !watch.last_checked || new Date(lifecycle.last_seen) > new Date(watch.last_checked);
    if (isNewConsensus) {
      sightings.push({
        alert_type: 'cross_feed_consensus',
        source: sourcesSeen.join(','),
        confidence: lifecycle.current_score,
        detail: {
          source_count: sourcesSeen.length,
          sources: sourcesSeen,
          observation_count: lifecycle.observation_count,
        },
      });
    }
  }

  return sightings.slice(0, 5); // Cap per-watch alerts per sweep
}

// ── Webhook Delivery ────────────────────────────────────────────────────

async function deliverWebhook(
  watch: WatchlistEntry,
  sighting: IocSighting,
  now: string
): Promise<boolean> {
  if (!watch.webhook_url) return false;

  const isDiscord = watch.webhook_url.includes('discord.com');
  const isSlack = watch.webhook_url.includes('hooks.slack.com');
  const isTelegram = watch.webhook_url.includes('api.telegram.org');

  let body: Record<string, unknown>;

  if (isDiscord) {
    const color =
      sighting.alert_type === 'cross_feed_consensus' ? 0xff0000 :
      sighting.confidence >= 80 ? 0xff6600 :
      0xffcc00;
    body = {
      embeds: [
        {
          title: `IOC Watch Alert: ${watch.indicator}`,
          description: watch.label || `${watch.indicator_type.toUpperCase()} watch triggered`,
          color,
          fields: [
            { name: 'Indicator', value: `\`${watch.indicator}\``, inline: true },
            { name: 'Type', value: watch.indicator_type.toUpperCase(), inline: true },
            { name: 'Confidence', value: `${sighting.confidence}%`, inline: true },
            { name: 'Alert Type', value: sighting.alert_type.replace(/_/g, ' '), inline: true },
            { name: 'Source', value: sighting.source, inline: true },
            { name: 'TLP', value: watch.tlp, inline: true },
          ],
          timestamp: now,
          footer: { text: 'IOC Watchlist • pranithjain.qzz.io' },
        },
      ],
    };
  } else if (isSlack) {
    body = {
      text: `IOC Watch Alert: ${watch.indicator}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [
              `*IOC Watch Alert*`,
              `*Indicator:* \`${watch.indicator}\``,
              `*Type:* ${watch.indicator_type.toUpperCase()}`,
              `*Confidence:* ${sighting.confidence}%`,
              `*Alert:* ${sighting.alert_type.replace(/_/g, ' ')}`,
              `*Source:* ${sighting.source}`,
              `*TLP:* ${watch.tlp}`,
              watch.label ? `*Label:* ${watch.label}` : '',
            ].filter(Boolean).join('\n'),
          },
        },
      ],
    };
  } else if (isTelegram) {
    const text = [
      `🔍 *IOC Watch Alert*`,
      ``,
      `*Indicator:* \`${watch.indicator}\``,
      `*Type:* ${watch.indicator_type.toUpperCase()}`,
      `*Confidence:* ${sighting.confidence}%`,
      `*Alert:* ${sighting.alert_type.replace(/_/g, ' ')}`,
      `*Source:* ${sighting.source}`,
      `*TLP:* ${watch.tlp}`,
      watch.label ? `*Label:* ${watch.label}` : '',
    ].filter(Boolean).join('\n');
    body = { text, parse_mode: 'Markdown' };
  } else {
    // Generic webhook (JSON POST)
    body = {
      event: 'ioc_watch_alert',
      indicator: watch.indicator,
      indicator_type: watch.indicator_type,
      confidence: sighting.confidence,
      alert_type: sighting.alert_type,
      source: sighting.source,
      tlp: watch.tlp,
      label: watch.label,
      detected_at: now,
      detail: sighting.detail,
    };
  }

  try {
    await pinnedFetch(watch.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    return true;
  } catch {
    return false;
  }
}

// ── Alert History ───────────────────────────────────────────────────────

export async function listAlerts(
  db: D1Database,
  opts: { watchId?: number; indicator?: string; since?: string; limit?: number } = {}
): Promise<WatchAlert[]> {
  await ensureWatchlistTables(db);
  const limit = Math.min(opts.limit ?? 50, 200);
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.watchId) {
    conditions.push('watch_id = ?');
    params.push(opts.watchId);
  }
  if (opts.indicator) {
    conditions.push('indicator = ?');
    params.push(opts.indicator.toLowerCase());
  }
  if (opts.since) {
    conditions.push('detected_at >= ?');
    params.push(opts.since);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await db
    .prepare(
      `SELECT id, watch_id, indicator, indicator_type, alert_type, source, confidence, detail, detected_at, webhook_delivered
       FROM ioc_watch_alerts ${where}
       ORDER BY detected_at DESC LIMIT ?`
    )
    .bind(...params, limit)
    .all();
  return (result.results ?? []).map((r) => ({
    id: r.id as number,
    watch_id: r.watch_id as number,
    indicator: r.indicator as string,
    indicator_type: r.indicator_type as IocType,
    alert_type: r.alert_type as WatchAlert['alert_type'],
    source: r.source as string,
    confidence: r.confidence as number,
    detail: r.detail as string,
    detected_at: r.detected_at as string,
    webhook_delivered: (r.webhook_delivered as number) === 1,
  }));
}

/**
 * Get alert stats for the dashboard.
 */
export async function getWatchlistStats(db: D1Database): Promise<{
  total_watches: number;
  watches_by_type: Record<string, number>;
  total_alerts_24h: number;
  total_alerts_7d: number;
  alerts_by_type: Record<string, number>;
  webhook_delivery_rate: number;
}> {
  await ensureWatchlistTables(db);

  const watches = await db
    .prepare(`SELECT indicator_type, COUNT(*) as cnt FROM ioc_watchlist GROUP BY indicator_type`)
    .all<{ indicator_type: string; cnt: number }>();

  const watchesByType: Record<string, number> = {};
  let totalWatches = 0;
  for (const w of watches.results ?? []) {
    watchesByType[w.indicator_type] = w.cnt;
    totalWatches += w.cnt;
  }

  const now = new Date();
  const ago24h = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const ago7d = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();

  const alerts24h = await db
    .prepare(`SELECT COUNT(*) as cnt FROM ioc_watch_alerts WHERE detected_at >= ?`)
    .bind(ago24h)
    .first<{ cnt: number }>();
  const alerts7d = await db
    .prepare(`SELECT COUNT(*) as cnt FROM ioc_watch_alerts WHERE detected_at >= ?`)
    .bind(ago7d)
    .first<{ cnt: number }>();

  const alertsByTypeResult = await db
    .prepare(
      `SELECT alert_type, COUNT(*) as cnt FROM ioc_watch_alerts WHERE detected_at >= ? GROUP BY alert_type`
    )
    .bind(ago7d)
    .all<{ alert_type: string; cnt: number }>();
  const alertsByType: Record<string, number> = {};
  for (const a of alertsByTypeResult.results ?? []) {
    alertsByType[a.alert_type] = a.cnt;
  }

  const deliveries = await db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN webhook_delivered = 1 THEN 1 ELSE 0 END) as delivered
       FROM ioc_watch_alerts WHERE detected_at >= ?`
    )
    .bind(ago7d)
    .first<{ total: number; delivered: number }>();

  return {
    total_watches: totalWatches,
    watches_by_type: watchesByType,
    total_alerts_24h: alerts24h?.cnt ?? 0,
    total_alerts_7d: alerts7d?.cnt ?? 0,
    alerts_by_type: alertsByType,
    webhook_delivery_rate: deliveries?.total ? Math.round(((deliveries.delivered ?? 0) / deliveries.total) * 100) : 0,
  };
}
