import type { Context } from 'hono';
import type { Env } from '../env';
import { buildSummary, FEED_SOURCES, type IocFeedSummary, type SourceId } from '../lib/ioc-feed-parsers';

/**
 * IOC live-snapshot — paired with /threatintel/threat-map.
 *
 * Fans out to four free abuse.ch + OpenPhish CSV feeds in parallel server-side
 * and returns each source's most-recent entries in one envelope. Same shape
 * as /api/v1/snapshot for the news cards: per-source `ok`/`error` so a
 * single bad upstream doesn't blank the whole panel.
 *
 * Cache: 1h at the edge — matches the hourly snapshot warmup cron. Was
 * 5 min, but the per-IOC upstream feeds rebuild every 30-60 min anyway,
 * so the 5-min churn was burning Workers KV writes for negligible UX
 * gain.
 */

const CACHE_TTL = 60 * 60;
const FETCH_TIMEOUT_MS = 15_000;
const PER_SOURCE_LIMIT = 8; // keep payload small — panel renders top 4-5 anyway

const SNAPSHOT_SOURCES: SourceId[] = ['urlhaus', 'malwarebazaar', 'threatfox', 'openphish'];

interface SourcePayload {
  ok: boolean;
  data: IocFeedSummary | null;
  error?: string;
}

export interface IocSnapshotResponse {
  generated_at: string;
  sources: Record<string, SourcePayload>;
}

async function fetchOne(id: SourceId): Promise<SourcePayload> {
  const feed = FEED_SOURCES[id];
  try {
    const r = await fetch(feed.url, {
      redirect: 'follow',
      headers: {
        'user-agent': 'pranithjain-ioc-snapshot/1.0',
        accept: '*/*',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) return { ok: false, data: null, error: `upstream ${r.status}` };
    const body = await r.text();
    const summary = buildSummary(id, body);
    // Trim entries to the top N most-recent — buildSummary may return up to
    // CAP=100 entries which would bloat the snapshot payload.
    summary.entries = summary.entries.slice(0, PER_SOURCE_LIMIT);
    return { ok: true, data: summary };
  } catch (e) {
    console.error('fetchOne failed:', e instanceof Error ? e.message : String(e));
    const isTimeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return { ok: false, data: null, error: isTimeout ? 'upstream timeout' : 'upstream error' };
  }
}

export async function iocSnapshotHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request('https://ioc-snapshot-cache.internal/v2-1h');
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const settled = await Promise.all(SNAPSHOT_SOURCES.map(fetchOne));
  const sources: Record<string, SourcePayload> = {};
  for (let i = 0; i < SNAPSHOT_SOURCES.length; i++) {
    const id = SNAPSHOT_SOURCES[i];
    const payload = settled[i];
    if (id !== undefined && payload !== undefined) sources[id] = payload;
  }

  const body: IocSnapshotResponse = {
    generated_at: new Date().toISOString(),
    sources,
  };

  const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${CACHE_TTL}` });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
