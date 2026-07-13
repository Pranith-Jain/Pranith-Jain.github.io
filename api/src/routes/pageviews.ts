import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Global site view counter (D1-backed — NOT KV, so it doesn't touch the
 * KV write quota). Replaces the old per-browser localStorage tally that
 * displayed as a global "N views" but differed on every device/session.
 *
 *   GET  /api/v1/pageviews          → { views } (edge-cached 60s; consistent
 *                                       across every device)
 *   GET  /api/v1/pageviews?inc=1    → increment once, return fresh { views }
 *
 * The client guards `?inc=1` to once per browser session (sessionStorage),
 * matching the old "unique sessions, not reloads" intent. It's a vanity
 * counter, not billing — not hardened against deliberate inflation.
 */
const CACHE_KEY = 'https://pageviews-cache.internal/v1';

export async function pageViewsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ views: 0 }, 200, { 'cache-control': 'no-store' });

  const inc = c.req.query('inc') === '1';
  const cache = (caches as unknown as { default: Cache }).default;

  if (!inc) {
    const hit = await cache.match(CACHE_KEY);
    if (hit) return hit;
    try {
      const row = await db.prepare("SELECT n FROM counters WHERE key = 'site_views'").first<{ n: number }>();
      const res = c.json({ views: row?.n ?? 0 }, 200, { 'cache-control': 'public, max-age=60, s-maxage=60' });
      c.executionCtx.waitUntil(cache.put(CACHE_KEY, res.clone()));
      return res;
    } catch (_catchErr) {
      console.error('pageViewsHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      return c.json({ views: 0 }, 200, { 'cache-control': 'no-store' });
    }
  }

  // Increment (atomic upsert) and return the fresh total.
  try {
    const row = await db
      .prepare(
        `INSERT INTO counters (key, n) VALUES ('site_views', 1)
         ON CONFLICT(key) DO UPDATE SET n = n + 1
         RETURNING n`
      )
      .first<{ n: number }>();
    const views = row?.n ?? 0;
    // Refresh the read cache so the next GET reflects the new total.
    c.executionCtx.waitUntil(
      cache.put(
        CACHE_KEY,
        new Response(JSON.stringify({ views }), {
          headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60, s-maxage=60' },
        })
      )
    );
    return c.json({ views }, 200, { 'cache-control': 'no-store' });
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ views: 0 }, 200, { 'cache-control': 'no-store' });
  }
}
