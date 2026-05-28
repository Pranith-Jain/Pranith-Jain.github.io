import type { Context } from 'hono';
import type { Env } from '../env';
import { buildGraph, type GraphResponse } from '../lib/relationship-graph';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';

const CACHE_TTL = 600; // 10 min edge cache
/** KV fallback TTL — 6h. Only written when Cache API is cold AND the
 *  debounce marker (also Cache API) says we haven't written recently.
 *  Previously every unique (query, depth) pair hit KV on every miss. */
const KV_TTL = 6 * 60 * 60;

export async function relationshipGraphHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const query = c.req.query('q');
  if (!query || !query.trim()) {
    return c.json({ error: 'missing query param q' }, 400);
  }

  const depthParam = c.req.query('depth');
  const depth = depthParam ? Math.min(Math.max(parseInt(depthParam, 10) || 1, 1), 2) : 1;
  const normalizedQuery = query.trim().toLowerCase();
  const cacheKey = `relgraph:${normalizedQuery}:d${depth}`;

  // 1. Cache API (per-colo, free, no KV cost) — primary cache
  const edgeCache = caches.default;
  const edgeReq = new Request(`https://relgraph-cache.internal/v1/${encodeURIComponent(cacheKey)}`);
  const edgeHit = await edgeCache.match(edgeReq).catch(() => null);
  if (edgeHit) {
    return new Response(edgeHit.body, {
      ...edgeHit,
      headers: { ...Object.fromEntries(edgeHit.headers), 'X-Cache': 'HIT' },
    });
  }

  // 2. KV fallback — cross-colo durable cache
  const kv = c.env.KV_CACHE;
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, 'json');
      if (cached) {
        const response = c.json(cached, 200, {
          'Cache-Control': `public, max-age=${CACHE_TTL}`,
          'X-Cache': 'KV-HIT',
        });
        c.executionCtx.waitUntil(edgeCache.put(edgeReq, response.clone()));
        return response;
      }
    } catch { /* ignore */ }
  }

  const result: GraphResponse = await buildGraph(query.trim(), depth);

  const response = c.json(result, 200, {
    'Cache-Control': `public, max-age=${CACHE_TTL}`,
    'X-Cache': 'MISS',
  });

  // Write to Cache API (always — free)
  c.executionCtx.waitUntil(edgeCache.put(edgeReq, response.clone()));

  // Write to KV only if debounce allows (at most once per 6h per key).
  // Saves ~50-100 writes/day on moderate traffic.
  if (kv && result.nodes.length > 0) {
    c.executionCtx.waitUntil(
      (async () => {
        if (await shouldWriteLastGood(`relgraph:${cacheKey}`, KV_TTL)) {
          await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: KV_TTL });
        }
      })()
    );
  }

  return response;
}
