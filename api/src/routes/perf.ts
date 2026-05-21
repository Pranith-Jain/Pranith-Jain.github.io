import type { Hono } from 'hono';
import type { Env } from '../env';
import { getLatest, getHistory } from '../perf/storage';

/**
 * Read-only public surface for the perf dashboard. One endpoint returns
 * the latest snapshot + the rolling history; the page renders both.
 *
 * Caching is gentle: the snapshot only changes once a day (cron at 02:00
 * UTC), so a 5-minute edge cache is plenty without serving stale data
 * past the next run.
 */
export function registerPerfRoutes(app: Hono<{ Bindings: Env }>): void {
  app.get('/api/v1/perf', async (c) => {
    const ns = c.env.KV_CACHE;
    if (!ns) return c.json({ error: 'perf storage unavailable' }, 503);
    const [latest, history] = await Promise.all([getLatest(ns), getHistory(ns)]);
    return c.json({ latest, history }, 200, {
      'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=300',
    });
  });
}
