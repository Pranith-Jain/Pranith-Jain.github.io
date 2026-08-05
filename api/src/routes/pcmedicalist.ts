import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound, badGateway } from '../lib/api-error';
import { fetchResilient } from '../lib/fetch-resilient';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';
import {
  loadPcmIndex,
  getPcmDigest,
  getPcmLatest,
  filterPcmDigests,
  pcmCacheStats,
  type PcmItem,
} from '../lib/pcmedicalist-manifest';

/**
 * PCMedicalist Intelligence Feed — REST surface.
 *
 * Endpoints (all under /api/v1/pcmedicalist/):
 *   GET  /pcmedicalist/                 — slim index
 *   GET  /pcmedicalist/digests          — list digests with filters
 *   GET  /pcmedicalist/digests/:date    — slim digest body
 *   GET  /pcmedicalist/latest           — most recent digest
 *   GET  /pcmedicalist/day/:date/search — LIVE deep-dive: proxy the full
 *                                         ~4.6MB upstream feed and filter
 *                                         server-side (Cache-API + KV last-good)
 *   GET  /pcmedicalist/stats            — cache + manifest stats
 *
 * Source: https://github.com/PCMedicalist/pcmedicalist-intellegence-feed
 * License: CC BY 4.0 (attribution via in-data "source" field satisfies)
 */

const PCM_RAW_BASE = 'https://raw.githubusercontent.com/PCMedicalist/pcmedicalist-intellegence-feed/main';
const SEARCH_CACHE_TTL_SECONDS = 3600;
const KV_LAST_GOOD_TTL_SECONDS = 24 * 60 * 60;

export const pcmedicalistRouter = new Hono<{ Bindings: Env }>();

pcmedicalistRouter.get('/pcmedicalist/', async (c) => {
  try {
    const idx = await loadPcmIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      generatedAt: idx.generatedAt,
      counts: idx.counts,
      digests: idx.digests,
    });
  } catch (e) {
    return internalError(c, `pcm_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

pcmedicalistRouter.get('/pcmedicalist/digests', async (c) => {
  try {
    const idx = await loadPcmIndex(c.env.ASSETS);
    const dateFrom = c.req.query('dateFrom') ?? undefined;
    const dateTo = c.req.query('dateTo') ?? undefined;
    const keyword = c.req.query('q') ?? undefined;
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 500);
    const digests = filterPcmDigests(idx, { dateFrom, dateTo, keyword, limit });
    return c.json({ total: idx.counts.digests, returned: digests.length, digests });
  } catch (e) {
    return internalError(c, `pcm_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

pcmedicalistRouter.get('/pcmedicalist/digests/:date', async (c) => {
  try {
    const date = c.req.param('date');
    const digest = await getPcmDigest(c.env.ASSETS, date);
    if (!digest) {
      return notFound(c, 'digest not found — check the date is YYYY-MM-DD and present in the index');
    }
    return c.json(digest);
  } catch (e) {
    return internalError(c, `pcm_get_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

pcmedicalistRouter.get('/pcmedicalist/latest', async (c) => {
  try {
    const digest = await getPcmLatest(c.env.ASSETS);
    if (!digest) return notFound(c, 'no digests in the index yet');
    return c.json(digest);
  } catch (e) {
    return internalError(c, `pcm_latest_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

/**
 * Deep-dive: proxy the full day feed.json (~4.6 MB) from GitHub raw, filter
 * server-side, and return a capped item set. Cache-API L1 + KV last-good
 * (depx pattern) so repeated/searched queries hit the edge instead of
 * re-downloading megabytes.
 */
pcmedicalistRouter.get('/pcmedicalist/day/:date/search', async (c) => {
  const date = c.req.param('date') || (await latestPcmDate(c));
  if (!date) return notFound(c, 'no digests in the index yet');

  const layerRaw = c.req.query('layer');
  const keyword = c.req.query('q') ?? undefined;
  const cve = c.req.query('cve') ?? undefined;
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 200);

  const cacheKey = new Request(
    `https://pcm-search.internal/d/${date}?layer=${layerRaw ?? ''}&q=${keyword ?? ''}&cve=${cve ?? ''}&limit=${limit}`
  );
  const cache = (caches as unknown as { default: Cache }).default;
  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  const kvKey = `pcmedicalist:search:${date}`;
  const kv = c.env.KV_CACHE;

  try {
    const feedUrl = `${PCM_RAW_BASE}/digests/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}/feed.json`;
    const res = await fetchResilient(
      feedUrl,
      { headers: { 'user-agent': 'pranithjain-pcmedicalist/1.0 (+https://pranithjain.qzz.io)' } },
      { attempts: 2, timeoutMs: 20_000 }
    );
    if (!res.ok) throw new Error(`upstream ${res.status} for ${feedUrl}`);
    const raw = (await res.json()) as Array<Record<string, unknown>>;
    const items = Array.isArray(raw) ? raw : [];

    const results = searchPcmFeed(items, {
      layer: layerRaw ? parseInt(layerRaw, 10) : undefined,
      keyword,
      cve,
      limit,
    });

    const body = {
      date,
      requested: { layer: layerRaw ?? null, keyword: keyword ?? null, cve: cve ?? null, limit },
      totalMatched: results.length,
      returned: results.length,
      items: results,
      source: 'github.com/PCMedicalist/pcmedicalist-intellegence-feed',
      sourceUrl: 'https://app.pcmedicalist.com/intel',
      license: 'CC-BY-4.0',
    };

    const response = c.json(body, 200, { 'Cache-Control': `public, max-age=${SEARCH_CACHE_TTL_SECONDS}` });
    c.executionCtx.waitUntil(
      (async () => {
        await cache.put(cacheKey, response.clone());
        if (kv && (await shouldWriteLastGood('pcmedicalist:search'))) {
          await kv.put(kvKey, JSON.stringify(body), { expirationTtl: KV_LAST_GOOD_TTL_SECONDS });
        }
      })()
    );
    return response;
  } catch (err) {
    // KV last-good fallback
    if (kv) {
      try {
        const stale = await kv.get(kvKey);
        if (stale) {
          const staleBody = JSON.parse(stale) as Record<string, unknown>;
          return c.json(
            { ...staleBody, stale: true, upstream_error: err instanceof Error ? err.message : String(err) },
            200,
            { 'Cache-Control': 'public, max-age=300' }
          );
        }
      } catch {
        /* fall through */
      }
    }
    logError('pcm day search failed', err);
    return badGateway(c, `upstream feed fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});

pcmedicalistRouter.get('/pcmedicalist/stats', async (c) => {
  try {
    const idx = await loadPcmIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      counts: idx.counts,
      latestDate: idx.digests[0]?.date ?? null,
      cache: pcmCacheStats(),
    });
  } catch (e) {
    return internalError(c, `pcm_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

async function latestPcmDate(c: Context<{ Bindings: Env }>): Promise<string | null> {
  try {
    const idx = await loadPcmIndex(c.env.ASSETS);
    return idx.digests[0]?.date ?? null;
  } catch {
    return null;
  }
}

/** Filter a full upstream feed array against the canonical item schema. */
export function searchPcmFeed(
  items: Array<Record<string, unknown>>,
  opts: { layer?: number; keyword?: string; cve?: string; limit?: number }
): PcmItem[] {
  const { layer, keyword, cve, limit = 50 } = opts;
  const kwNeedle = keyword?.toLowerCase();
  const cveNeedle = cve?.toUpperCase().replace(/^CVE[-_]?/, '');
  const out: PcmItem[] = [];
  for (const item of items) {
    if (layer !== undefined && item._layer !== layer) continue;
    const title = String(item.title ?? '');
    const summary = String(item.summary ?? '');
    const source = String(item.source ?? '');
    const category = String(item.category ?? '');
    const cves = Array.isArray(item.cves) ? (item.cves as string[]) : [];
    if (kwNeedle) {
      const hay = `${title} ${summary} ${source} ${category}`.toLowerCase();
      if (!hay.includes(kwNeedle)) continue;
    }
    if (cveNeedle) {
      const hit = cves.some((x) => x.toUpperCase().replace(/^CVE[-_]?/, '') === cveNeedle || x.includes(cveNeedle));
      if (!hit) continue;
    }
    out.push({
      id: (item.id as string | null) ?? null,
      title,
      summary,
      url: (item.url as string | null) ?? null,
      source: (item.source as string | null) ?? null,
      category: (item.category as string | null) ?? null,
      subcategory: (item.subcategory as string | null) ?? null,
      published: (item.published as string | null) ?? null,
      severity: (item.severity as string | null) ?? null,
      trust_score: typeof item.trust_score === 'number' ? item.trust_score : null,
      cves,
      technologies: Array.isArray(item.technologies) ? (item.technologies as string[]).slice(0, 8) : [],
      source_type: (item.source_type as string | null) ?? null,
    });
    if (out.length >= limit) break;
  }
  return out;
}
