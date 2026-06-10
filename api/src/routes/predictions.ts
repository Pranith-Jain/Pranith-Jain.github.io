import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchPredictions, type PredictionBuckets } from '../lib/manifold';

/**
 * GET /api/v1/predictions
 *
 * Manifold Markets predictions, grouped into cyber / tech / AI buckets, ranked
 * by liquidity. Read-only, fail-soft (empty buckets, never a 500, when the
 * upstream is unreachable). Edge-cached 10 min; also self-warms KV
 * `predictions:warm` so cold loads are fast and the Global Pulse layer can read
 * it without its own upstream call.
 */

const KV_KEY = 'predictions:warm';
const KV_TTL = 900; // 15 min

interface PredictionsResponse {
  total: number;
  buckets: PredictionBuckets;
  timestamp: string;
  source: 'Manifold';
}

function envelope(buckets: PredictionBuckets): PredictionsResponse {
  return {
    total: buckets.cyber.length + buckets.tech.length + buckets.ai.length,
    buckets,
    timestamp: new Date().toISOString(),
    source: 'Manifold',
  };
}

export async function predictionsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;

  // Warm path: serve the self-warmed blob if present (0 upstream subrequests).
  if (kv) {
    const cached = await kv.get<PredictionsResponse>(KV_KEY, 'json').catch(() => null);
    if (cached && cached.buckets) {
      return c.json(cached, 200, { 'Cache-Control': 'public, max-age=600' });
    }
  }

  // Cold path: fetch upstream, then self-warm KV for the next caller.
  const buckets = await fetchPredictions();
  const body = envelope(buckets);
  if (kv && body.total > 0) {
    await kv.put(KV_KEY, JSON.stringify(body), { expirationTtl: KV_TTL }).catch(() => {});
  }
  return c.json(body, 200, { 'Cache-Control': 'public, max-age=600' });
}
