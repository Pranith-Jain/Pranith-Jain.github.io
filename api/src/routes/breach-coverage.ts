/**
 * Breach-coverage route — public OSINT headline search across 8 named
 * cybersecurity news sites (DarkWebInformer, DataBreaches.net,
 * BleepingComputer, The Record, Threatpost, HackRead, SecurityWeek,
 * CyberScoop). All sources are public RSS feeds; none point at leak
 * forums, dumps, or credentials. The route serves HEADLINES + LINKS.
 *
 * Route: GET /api/v1/breach-coverage?topic=breach|forums|custom&q=...&limit=N
 *   - `topic` defaults to "breach" (broad coverage)
 *   - `forums` is a tight topic that only matches named leak-forum brands
 *   - `custom` requires `q` (whitespace-AND'd, case-insensitive)
 *   - `limit` defaults to 50, hard-max 200
 *
 * Cached at the edge for 15 minutes. RSS feeds update slowly; the user
 * is asking "what's the current OSINT coverage" not "what was published
 * 30 seconds ago". 15 min keeps the result fresh without hammering
 * 8 upstream feeds on every page load.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest } from '../lib/api-error';
import { fetchBreachCoverage, type CoverageTopic, type CoverageInputItem } from '../lib/breach-coverage';
import { trackEvent, visitorCountry } from '../lib/analytics';

const CACHE_TTL_SECONDS = 900;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function parseTopic(s: string | undefined): CoverageTopic | null {
  if (!s) return 'breach';
  if (s === 'breach' || s === 'forums' || s === 'custom') return s;
  return null;
}

function parseLimit(s: string | undefined): number {
  if (!s) return DEFAULT_LIMIT;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

export interface BreachCoverageResponse {
  generated_at: string;
  topic: CoverageTopic;
  query?: string;
  limit: number;
  items: CoverageInputItem[];
  sources: Array<{
    id: string;
    name: string;
    url: string;
    ok: boolean;
    status?: number;
    items_fetched: number;
    error?: string;
  }>;
  /** True when at least one upstream source succeeded. */
  healthy: boolean;
}

export async function breachCoverageHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const topic = parseTopic(c.req.query('topic') ?? undefined);
  if (topic === null) return badRequest(c, 'topic must be one of: breach, forums, custom');
  const query = c.req.query('q')?.trim();
  if (topic === 'custom' && !query) {
    return badRequest(c, "topic=custom requires a non-empty q=... (whitespace-AND'd terms)");
  }
  if (topic !== 'custom' && query) {
    return badRequest(c, 'q=... is only valid with topic=custom');
  }
  const limit = parseLimit(c.req.query('limit') ?? undefined);

  // Edge cache key encodes every parameter that affects output.
  const cacheKey = new Request(
    `https://breach-coverage.internal/v1?t=${topic}&q=${encodeURIComponent(query ?? '')}&l=${limit}`
  );
  try {
    const hit = await caches.default.match(cacheKey);
    if (hit) return new Response(hit.body, hit);
  } catch {
    /* cache miss is fine */
  }

  const result = await fetchBreachCoverage({ topic, query, limit });
  const body: BreachCoverageResponse = {
    generated_at: new Date().toISOString(),
    topic,
    query: query || undefined,
    limit,
    items: result.items,
    sources: result.sources,
    healthy: result.sources.some((s) => s.ok),
  };

  c.executionCtx.waitUntil(
    (async () => {
      try {
        await caches.default.put(
          cacheKey,
          new Response(JSON.stringify(body), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'cache-control': `public, max-age=${CACHE_TTL_SECONDS}`,
            },
          })
        );
      } catch {
        /* cache writes are non-fatal */
      }
      try {
        trackEvent(c.env, 'breach_coverage_fetch', {
          blobs: [topic],
          doubles: [result.items.length],
          indexes: [visitorCountry(c.req.raw)],
        });
      } catch {
        /* telemetry is best-effort */
      }
    })()
  );

  return c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` });
}
