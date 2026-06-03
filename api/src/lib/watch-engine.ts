import type { D1Database } from '@cloudflare/workers-types';
// Track the producers' canonical keys so a version bump can't silently strand
// these reads (previously hardcoded v8/v11 while producers wrote v9/v13 → IOC
// and ransomware-group watch alerts never fired on live indicators).
import { LIVE_IOCS_CACHE_KEY } from '../routes/live-iocs';
import { RANSOMWARE_RECENT_CACHE_KEY } from '../routes/ransomware-recent';
import { pinnedFetch } from './ssrf-guard';

export interface Watch {
  id: string;
  label: string;
  type: 'ransomware-group' | 'cve-keyword' | 'actor' | 'ioc';
  value: string;
  webhook: string;
  created_at: string;
  last_triggered: string | null;
}

export interface AlertEvent {
  watch_id: string;
  label: string;
  type: Watch['type'];
  value: string;
  matched_at: string;
  match: string;
  detail?: string;
}

const WATCHES_KV_KEY = 'watches:v1';
const ALERT_LOG_KV_KEY = 'alert-log:v1';

async function ensureWatchTables(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS watches (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    webhook TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_triggered TEXT
  )`
    )
    .run();
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS alert_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    watch_id TEXT NOT NULL,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    matched_at TEXT NOT NULL,
    match TEXT NOT NULL,
    detail TEXT
  )`
    )
    .run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_alert_logs_matched ON alert_logs(matched_at)').run();
}

export async function listWatches(kv: KVNamespace, db?: D1Database): Promise<Watch[]> {
  if (db) {
    try {
      await ensureWatchTables(db);
      const rows = await db.prepare('SELECT * FROM watches ORDER BY created_at DESC').all<Watch>();
      if (rows.results && rows.results.length > 0) return rows.results;
    } catch {
      /* fall through to KV */
    }
  }
  const raw = await kv.get(WATCHES_KV_KEY, 'json').catch(() => null);
  return (raw as Watch[]) ?? [];
}

export async function saveWatch(kv: KVNamespace, watch: Watch, db?: D1Database): Promise<void> {
  if (db) {
    try {
      await ensureWatchTables(db);
      await db
        .prepare(
          `INSERT OR REPLACE INTO watches (id, label, type, value, webhook, created_at, last_triggered)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(watch.id, watch.label, watch.type, watch.value, watch.webhook, watch.created_at, watch.last_triggered)
        .run();
      return;
    } catch {
      /* fall through to KV */
    }
  }
  const watches = await listWatches(kv);
  const idx = watches.findIndex((w) => w.id === watch.id);
  if (idx >= 0) watches[idx] = watch;
  else watches.push(watch);
  await kv.put(WATCHES_KV_KEY, JSON.stringify(watches));
}

export async function deleteWatch(kv: KVNamespace, id: string, db?: D1Database): Promise<void> {
  if (db) {
    try {
      await ensureWatchTables(db);
      await db.prepare('DELETE FROM watches WHERE id = ?').bind(id).run();
      return;
    } catch {
      /* fall through to KV */
    }
  }
  const watches = await listWatches(kv);
  await kv.put(WATCHES_KV_KEY, JSON.stringify(watches.filter((w) => w.id !== id)));
}

export async function appendAlertLog(kv: KVNamespace, event: AlertEvent, db?: D1Database): Promise<void> {
  if (db) {
    try {
      await ensureWatchTables(db);
      await db
        .prepare(
          `INSERT INTO alert_logs (watch_id, label, type, value, matched_at, match, detail)
        VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(event.watch_id, event.label, event.type, event.value, event.matched_at, event.match, event.detail ?? null)
        .run();
      return;
    } catch {
      /* fall through to KV */
    }
  }
  const raw = await kv.get(ALERT_LOG_KV_KEY, 'json').catch(() => null);
  const log = (raw as AlertEvent[]) ?? [];
  log.unshift(event);
  if (log.length > 200) log.length = 200;
  await kv.put(ALERT_LOG_KV_KEY, JSON.stringify(log));
}

export async function getAlertLog(kv: KVNamespace, db?: D1Database, limit: number = 100): Promise<AlertEvent[]> {
  if (db) {
    try {
      await ensureWatchTables(db);
      const rows = await db
        .prepare('SELECT * FROM alert_logs ORDER BY matched_at DESC LIMIT ?')
        .bind(limit)
        .all<AlertEvent>();
      if (rows.results && rows.results.length > 0) return rows.results;
    } catch {
      /* fall through to KV */
    }
  }
  const raw = await kv.get(ALERT_LOG_KV_KEY, 'json').catch(() => null);
  return (raw as AlertEvent[]) ?? [];
}

async function readCachedJson<T>(cacheKey: string): Promise<T | null> {
  try {
    const cache = caches.default;
    const cached = await cache.match(new Request(cacheKey));
    if (cached) return (await cached.json()) as T;
  } catch {
    /* cold */
  }
  return null;
}

export async function checkWatches(kv: KVNamespace, now: string, db?: D1Database): Promise<AlertEvent[]> {
  const watches = await listWatches(kv, db);
  if (watches.length === 0) return [];

  const alerts: AlertEvent[] = [];

  const needsTrigger = (w: Watch): boolean => {
    if (!w.last_triggered) return true;
    const elapsed = Date.parse(now) - Date.parse(w.last_triggered);
    return elapsed > 3600_000;
  };

  for (const watch of watches) {
    if (!needsTrigger(watch)) continue;
    if (!watch.webhook) continue;

    try {
      let matched = false;
      let matchText = '';
      let detail = '';

      if (watch.type === 'ransomware-group') {
        const data = await readCachedJson<{ victims: Array<{ victim: string; group: string }> }>(
          RANSOMWARE_RECENT_CACHE_KEY
        );
        if (data) {
          const re = new RegExp(`\\b${escapeRegex(watch.value)}\\b`, 'i');
          const victim = (data.victims ?? []).find((v) => re.test(v.group));
          if (victim) {
            matched = true;
            matchText = `New victim: ${victim.victim}`;
            detail = `Group ${watch.value} — ${victim.victim}`;
          }
        }
      } else if (watch.type === 'cve-keyword') {
        const data = await readCachedJson<{ cves: Array<{ id: string; description?: string }> }>(
          'https://cve-recent-cache.internal/v10-750-paged'
        );
        if (data) {
          const re = new RegExp(`\\b${escapeRegex(watch.value)}\\b`, 'i');
          const match = (data.cves ?? []).find(
            (c) => c.id.toLowerCase().includes(watch.value.toLowerCase()) || re.test(c.description ?? '')
          );
          if (match) {
            matched = true;
            matchText = match.id;
            detail = match.description ? match.description.slice(0, 200) : '';
          }
        }
      } else if (watch.type === 'ioc') {
        const data = await readCachedJson<{ items: Array<{ value: string; kind: string; source: string }> }>(
          LIVE_IOCS_CACHE_KEY
        );
        if (data) {
          const match = (data.items ?? []).find((i) => i.value.toLowerCase() === watch.value.toLowerCase());
          if (match) {
            matched = true;
            matchText = match.value;
            detail = `${match.kind} · ${match.source}`;
          }
        }
      } else if (watch.type === 'actor') {
        const data = await readCachedJson<{
          groups: Array<{ display_name: string; slug: string; posts_in_window: number }>;
        }>('https://actor-timeline-cache.internal/v3-mti');
        if (data) {
          const re = new RegExp(`\\b${escapeRegex(watch.value)}\\b`, 'i');
          const match = (data.groups ?? []).find((g) => re.test(g.display_name) || re.test(g.slug));
          if (match && match.posts_in_window > 0) {
            matched = true;
            matchText = match.display_name;
            detail = `${match.posts_in_window} recent post${match.posts_in_window === 1 ? '' : 's'}`;
          }
        }
      }

      if (matched) {
        const event: AlertEvent = {
          watch_id: watch.id,
          label: watch.label,
          type: watch.type,
          value: watch.value,
          matched_at: now,
          match: matchText,
          detail,
        };
        alerts.push(event);
        watch.last_triggered = now;
        try {
          await pinnedFetch(watch.webhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              text: `[Watch Alert] ${watch.label}\nType: ${watch.type}\nMatch: ${matchText}\n${detail ? `Detail: ${detail}` : ''}\nTime: ${now}`,
            }),
            signal: AbortSignal.timeout(5000),
          });
        } catch {
          /* webhook unreachable — alert still logged */
        }
      }
    } catch {
      /* per-watch error — continue */
    }
  }

  // Batch-persist — D1 primary, KV fallback
  if (alerts.length > 0) {
    try {
      if (db) {
        await ensureWatchTables(db);
        for (const w of watches) {
          await db
            .prepare(
              `INSERT OR REPLACE INTO watches (id, label, type, value, webhook, created_at, last_triggered)
            VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(w.id, w.label, w.type, w.value, w.webhook, w.created_at, w.last_triggered)
            .run();
        }
        for (const event of alerts) {
          await db
            .prepare(
              `INSERT INTO alert_logs (watch_id, label, type, value, matched_at, match, detail)
            VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              event.watch_id,
              event.label,
              event.type,
              event.value,
              event.matched_at,
              event.match,
              event.detail ?? null
            )
            .run();
        }
      }
    } catch {
      /* non-fatal */
    }

    try {
      await kv.put(WATCHES_KV_KEY, JSON.stringify(watches));
    } catch {
      /* non-fatal */
    }

    try {
      const raw = await kv.get(ALERT_LOG_KV_KEY, 'json').catch(() => null);
      const log = (raw as AlertEvent[]) ?? [];
      for (const event of alerts) log.unshift(event);
      if (log.length > 200) log.length = 200;
      await kv.put(ALERT_LOG_KV_KEY, JSON.stringify(log));
    } catch {
      /* non-fatal */
    }
  }

  return alerts;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Send a Telegram notification for a watch alert.
 * Uses the Telegram Bot API directly.
 */
export async function sendTelegramAlert(botToken: string, chatId: string, alert: AlertEvent): Promise<boolean> {
  try {
    const message =
      `🔔 <b>Watch Alert</b>\n\n` +
      `<b>Label:</b> ${alert.label}\n` +
      `<b>Type:</b> ${alert.type}\n` +
      `<b>Match:</b> ${alert.match}\n` +
      (alert.detail ? `<b>Detail:</b> ${alert.detail}\n` : '') +
      `<b>Time:</b> ${alert.matched_at}`;

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    });

    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Format watch alert for Telegram notification.
 */
export function formatTelegramAlert(alert: AlertEvent): string {
  const emoji =
    alert.type === 'ransomware-group'
      ? '💀'
      : alert.type === 'cve-keyword'
        ? '🔓'
        : alert.type === 'actor'
          ? '👤'
          : '🔍';

  return (
    `${emoji} <b>${alert.label}</b>\n` +
    `Type: ${alert.type}\n` +
    `Match: <code>${alert.match}</code>\n` +
    (alert.detail ? `Detail: ${alert.detail}\n` : '') +
    `Time: ${new Date(alert.matched_at).toLocaleString()}`
  );
}
