/**
 * Breach-forum status deltas — the "did any tracked forum's status just
 * change?" route. Backs a "Recent Status Changes" section on the
 * BreachForums page so analysts see the active→seized / online→offline
 * transitions the cron has logged over the trailing window.
 *
 * Route: GET /api/v1/breach-forum-status/deltas?since=ISO&limit=N
 *   - `since` is an ISO 8601 timestamp; defaults to 7 days back
 *   - `limit` caps result size; defaults to 100, hard-max 500
 *
 * Cached at the edge for 10 minutes. Status changes are slow (a forum
 * doesn't flap hourly), so 10 min is fresh enough and cuts upstream
 * load by ~80% in steady state.
 *
 * Hard guardrail: this route serves the META — when a forum's status
 * changed, what it changed from/to, and when. It never serves forum
 * content.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest } from '../lib/api-error';
import { trackEvent, visitorCountry } from '../lib/analytics';
import { readRecentDeltas, type StatusDelta } from '../lib/breach-forum-status';
import { safeNullLog } from '../lib/safe-catch';

const CACHE_TTL_SECONDS = 600;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;
const DEFAULT_SINCE_DAYS = 7;

function parseSince(s: string | undefined): string | null {
  if (!s) return null;
  // Accept any ISO 8601 the JS Date parser can handle. The route uses
  // the result as a D1 bind value, so anything Date.parse() doesn't
  // accept is rejected here (D1 would throw an opaque error otherwise).
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function parseLimit(s: string | undefined): number {
  if (!s) return DEFAULT_LIMIT;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

export interface BreachForumStatusResponse {
  generated_at: string;
  since: string;
  limit: number;
  deltas: StatusDelta[];
  /** Number of rows in the underlying snapshot table (cheap health check). */
  total_rows: number;
}

export async function breachForumStatusHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const sinceParam = parseSince(c.req.query('since') ?? undefined);
  if (c.req.query('since') && sinceParam === null) {
    return badRequest(c, 'since must be a valid ISO 8601 timestamp');
  }
  const since = sinceParam ?? new Date(Date.now() - DEFAULT_SINCE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const limit = parseLimit(c.req.query('limit') ?? undefined);

  // Edge cache keyed by since + limit. The body is the same for the same
  // window — a small overlap with the previous response is acceptable
  // and cheaper than a precise nanosecond key.
  const cacheKey = new Request(
    `https://breach-forum-status.internal/v1?since=${encodeURIComponent(since)}&limit=${limit}`
  );
  try {
    const hit = await caches.default.match(cacheKey);
    if (hit) return new Response(hit.body, hit);
  } catch (_catchErr) {
    console.error('breachForumStatusHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* cache miss is fine */
  }

  const db = c.env.BRIEFINGS_DB;
  if (!db) {
    return c.json({ error: 'service_unavailable', message: 'database not configured' }, 503, {
      'Cache-Control': 'no-store, max-age=0',
    });
  }

  const [deltas, totalRow] = await Promise.all([
    readRecentDeltas(db, { since, limit }),
    safeNullLog('d1-count-breach-forum', db
      .prepare('SELECT COUNT(*) AS n FROM breach_forum_status')
      .first<{ n: number }>()),
  ]);

  const body: BreachForumStatusResponse = {
    generated_at: new Date().toISOString(),
    since,
    limit,
    deltas,
    total_rows: totalRow?.n ?? 0,
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
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        /* cache writes are non-fatal */
      }
      try {
        trackEvent(c.env, 'breach_forum_status_fetch', {
          indexes: [visitorCountry(c.req.raw)],
        });
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        /* telemetry is best-effort */
      }
    })()
  );

  return c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` });
}
