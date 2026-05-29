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
import { fetchMtiSource, isMtiSource, MTI_SOURCES, MTI_TTL, type MtiSource } from '../lib/mythreatintel-api';

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

  const result = await fetchMtiSource(c.env, source, { q, limit });

  // Upstream flake / auth failure — surface without caching so a transient
  // miss isn't pinned for the source's full TTL. `upstream_status` tells a
  // dead token (401) from a rate-limit (429) / outage (5xx) / network error (0).
  if (!result.ok) {
    return c.json({ error: 'upstream_unavailable', source, upstream_status: result.upstreamStatus ?? null }, 502, {
      'cache-control': 'no-store',
    });
  }

  return c.json(
    {
      source,
      generated_at: new Date().toISOString(),
      total: result.total,
      count: result.count,
      items: result.items,
    },
    200,
    {
      'cache-control': result.items.length > 0 ? `public, max-age=${MTI_TTL[source]}` : 'no-store',
    }
  );
}
