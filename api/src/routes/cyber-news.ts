import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchCyberNews, type FeedTier } from '../lib/cyber-news-feeds';

const VALID_TIERS = new Set([1, 2, 3, 4, 5]);

export async function cyberNewsHandler(c: Context<{ Bindings: Env }>) {
  const tierParam = c.req.query('tier');
  const query = c.req.query('q')?.trim();
  const limit = Math.min(Number(c.req.query('limit')) || 100, 200);

  let tiers: FeedTier[] | undefined;
  if (tierParam) {
    tiers = tierParam
      .split(',')
      .map((t) => Number(t.trim()) as FeedTier)
      .filter((t) => VALID_TIERS.has(t));
    if (tiers.length === 0) tiers = undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const result = await fetchCyberNews({ tiers, query, limit, signal: controller.signal });
    return c.json(result, 200, {
      'Cache-Control': 'public, max-age=300, s-maxage=600',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: 'News fetch failed', detail: msg }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
