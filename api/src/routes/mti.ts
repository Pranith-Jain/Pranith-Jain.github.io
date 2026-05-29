/**
 * Public proxy for the MyThreatIntel REST API.
 *
 *   GET /api/v1/mti?source=<src>&q=<text>&limit=<n>
 *
 * The Bearer token is injected server-side by the client lib (Worker
 * secret), so the browser never sees it. This handler validates the
 * `source` against the allowlist, clamps `limit`, and returns the
 * normalized `{ ok, total, count, items }` envelope. 503 when the token
 * secret is unset (same contract as the ransomware.live PRO proxy).
 *
 * Edge caching is owned by the client lib's per-source Cache API slot;
 * this handler only sets the response `cache-control` so browsers and the
 * CDN reuse it for the source's TTL.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import {
  fetchMtiSource,
  isMtiSource,
  MTI_SOURCES,
  MTI_TTL,
  type MtiSource,
  type MtiRecord,
} from '../lib/mythreatintel-api';

/**
 * Global (cross-colo) last-good store for the default (no-query) view of each
 * source. caches.default is per-colo and short-lived; KV is global and long-
 * lived, so when the upstream token lapses or the API is briefly down, every
 * colo can still serve the last data it saw — flagged `stale: true` — instead
 * of a hard "Couldn't load this". 7-day window covers a long token outage.
 */
const MTI_LASTGOOD_PREFIX = 'mti:lastgood:v1:';
const MTI_LASTGOOD_TTL_SECONDS = 7 * 24 * 3600;

interface MtiLastGood {
  total: number;
  count: number;
  items: MtiRecord[];
}

export async function mtiHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const sourceParam = (c.req.query('source') ?? 'iocs').trim();
  if (!isMtiSource(sourceParam)) {
    return c.json({ error: 'unknown_source', allowed: MTI_SOURCES }, 400, { 'cache-control': 'no-store' });
  }
  const source: MtiSource = sourceParam;

  if (!c.env.MYTHREATINTEL_API_TOKEN) {
    return c.json({ error: 'not_configured', detail: 'MYTHREATINTEL_API_TOKEN secret is not set' }, 503, {
      'cache-control': 'no-store',
    });
  }

  const q = c.req.query('q') ?? '';
  const limitRaw = Number.parseInt(c.req.query('limit') ?? '100', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(500, Math.max(1, limitRaw)) : 100;
  // Fallback only applies to the canonical no-query view — searches don't have
  // a meaningful "last-good".
  const isDefaultQuery = q.trim() === '';
  const lastGoodKey = MTI_LASTGOOD_PREFIX + source;

  const result = await fetchMtiSource(c.env, source, { q, limit });

  // Healthy, non-empty fetch — serve it and refresh the global last-good.
  if (result.ok && result.items.length > 0) {
    if (isDefaultQuery && c.env.KV_CACHE) {
      const payload: MtiLastGood = { total: result.total, count: result.count, items: result.items };
      c.executionCtx.waitUntil(
        c.env.KV_CACHE.put(lastGoodKey, JSON.stringify(payload), {
          expirationTtl: MTI_LASTGOOD_TTL_SECONDS,
        }).catch(() => {})
      );
    }
    return c.json(
      { source, generated_at: new Date().toISOString(), total: result.total, count: result.count, items: result.items },
      200,
      { 'cache-control': `public, max-age=${MTI_TTL[source]}` }
    );
  }

  // Upstream failed (e.g. token lapsed → 401) or returned empty. Degrade to the
  // global last-good if we have one, flagged `stale` so the UI can say so.
  if (isDefaultQuery && c.env.KV_CACHE) {
    try {
      const lg = (await c.env.KV_CACHE.get(lastGoodKey, 'json')) as MtiLastGood | null;
      if (lg && Array.isArray(lg.items) && lg.items.length > 0) {
        const items = lg.items.slice(0, limit);
        return c.json(
          { source, generated_at: new Date().toISOString(), total: lg.total, count: items.length, items, stale: true },
          200,
          { 'cache-control': 'no-store' }
        );
      }
    } catch {
      /* fall through to the error path */
    }
  }

  // No live data and no cached fallback — surface the diagnosable failure.
  if (!result.ok) {
    return c.json(
      {
        error: 'upstream_unavailable',
        source,
        upstream_status: result.upstreamStatus ?? null,
        upstream_detail: result.upstreamDetail ?? null,
      },
      502,
      { 'cache-control': 'no-store' }
    );
  }

  // Live fetch succeeded but was empty and there's no last-good — return the
  // empty set without caching so it isn't pinned.
  return c.json(
    { source, generated_at: new Date().toISOString(), total: result.total, count: result.count, items: result.items },
    200,
    { 'cache-control': 'no-store' }
  );
}
