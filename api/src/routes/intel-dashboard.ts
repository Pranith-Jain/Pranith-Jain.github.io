import type { Context } from 'hono';
import type { Env } from '../env';
import { feedStatusHandler } from './feed-status';

interface FeedStatusBody {
  rows?: unknown[];
  overall?: string;
}

export async function intelDashboardHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;

  const [leakStats, feedStatus] = await Promise.allSettled([
    db
      ? db
          .prepare(
            `SELECT
               (SELECT COUNT(*) FROM telegram_leak_entries) as total_leaks,
               (SELECT COUNT(*) FROM telegram_leak_entries WHERE discovered_at > datetime('now', '-1 day')) as leaks_24h,
               (SELECT COUNT(*) FROM telegram_leak_entries WHERE discovered_at > datetime('now', '-7 days')) as leaks_7d,
               (SELECT COUNT(*) FROM telegram_watched_channels WHERE active = 1) as watched_channels,
               (SELECT COUNT(*) FROM telegram_discovered_channels WHERE reviewed = 0) as unreviewed_channels`
          )
          .first()
      : Promise.resolve(null),
    // Call the feed-status handler IN-PROCESS. The previous version did
    // `fetch('https://pranithjain.qzz.io/api/v1/feed-status')` — a worker
    // fetching its own public hostname is re-entrant and was resolving to null,
    // so feed_health/feed_count always read 'unknown'/0. feedStatusHandler is
    // its own cache-backed handler, so this is cheap on a warm colo.
    feedStatusHandler(c).then((r) => (r.ok ? (r.json() as Promise<FeedStatusBody>) : null)),
  ]);

  const leak = leakStats.status === 'fulfilled' ? (leakStats.value as Record<string, number> | null) : null;
  const feeds = feedStatus.status === 'fulfilled' ? feedStatus.value : null;

  return c.json(
    {
      generated_at: new Date().toISOString(),
      telegram_monitor: {
        total_leaks: leak?.total_leaks ?? 0,
        leaks_24h: leak?.leaks_24h ?? 0,
        watched_channels: leak?.watched_channels ?? 0,
        unreviewed_channels: leak?.unreviewed_channels ?? 0,
      },
      // Real 7-day leak-disclosure count. (The old `breaches_7d` queried a
      // `breach_disclosures` table that never existed — breach sources are live
      // proxies with no D1 persistence — so it always threw → 0.)
      leaks_7d: leak?.leaks_7d ?? 0,
      feed_health: feeds?.overall ?? 'unknown',
      feed_count: Array.isArray(feeds?.rows) ? feeds.rows.length : 0,
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}
