import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchPredictions, type PredictionBuckets } from '../lib/manifold';
import { routeCacheGet, routeCachePut } from '../lib/route-cache';

/**
 * GET /api/v1/predictions
 *
 * Manifold Markets predictions, grouped into cyber / tech / AI buckets, ranked
 * by liquidity. Read-only, fail-soft (empty buckets, never a 500, when the
 * upstream is unreachable). Edge-cached 10 min; also self-warms a per-colo
 * Cache API entry so cold loads are fast.
 */

const CACHE_KEY = 'predictions:warm';
const CACHE_TTL = 900; // 15 min

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
  const cached = await routeCacheGet<PredictionsResponse>(CACHE_KEY);
  if (cached && cached.buckets) {
    return c.json(cached, 200, { 'Cache-Control': 'public, max-age=600' });
  }

  const buckets = await fetchPredictions();
  const body = envelope(buckets);
  if (body.total > 0) {
    c.executionCtx.waitUntil(routeCachePut(CACHE_KEY, body, CACHE_TTL));
  }
  return c.json(body, 200, { 'Cache-Control': 'public, max-age=600' });
}
