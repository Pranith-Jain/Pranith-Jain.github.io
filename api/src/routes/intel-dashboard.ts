import type { Context } from 'hono';
import type { Env } from '../env';

interface DashboardSource {
  ok: boolean;
  state: 'ok' | 'degraded' | 'down' | 'cold';
  data: Record<string, unknown>;
}

export async function intelDashboardHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;

  const [leakStats, breachDbg, feedStatusBody] = await Promise.allSettled([
    db
      ? db
          .prepare(
            `SELECT
               (SELECT COUNT(*) FROM telegram_leak_entries) as total_leaks,
               (SELECT COUNT(*) FROM telegram_leak_entries WHERE discovered_at > datetime('now', '-1 day')) as leaks_24h,
               (SELECT COUNT(*) FROM telegram_watched_channels WHERE active = 1) as watched_channels,
               (SELECT COUNT(*) FROM telegram_discovered_channels WHERE reviewed = 0) as unreviewed_channels`
          )
          .first()
      : Promise.resolve(null),
    db
      ? db
          .prepare(
            `SELECT
               (SELECT COUNT(*) FROM breach_disclosures WHERE published_at > datetime('now', '-7 days')) as breach_7d`
          )
          .first()
      : Promise.resolve(null),
    fetch('https://pranithjain.qzz.io/api/v1/feed-status')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  const leak = leakStats.status === 'fulfilled' ? (leakStats.value as Record<string, number> | null) : null;
  const breach = breachDbg.status === 'fulfilled' ? (breachDbg.value as Record<string, number> | null) : null;
  const feeds =
    feedStatusBody.status === 'fulfilled'
      ? (feedStatusBody.value as { rows?: unknown[]; overall?: string } | null)
      : null;

  return c.json(
    {
      generated_at: new Date().toISOString(),
      telegram_monitor: {
        total_leaks: leak?.total_leaks ?? 0,
        leaks_24h: leak?.leaks_24h ?? 0,
        watched_channels: leak?.watched_channels ?? 0,
        unreviewed_channels: leak?.unreviewed_channels ?? 0,
      },
      breaches_7d: breach?.breach_7d ?? 0,
      feed_health: feeds?.overall ?? 'unknown',
      feed_count: Array.isArray(feeds?.rows) ? feeds.rows.length : 0,
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}
