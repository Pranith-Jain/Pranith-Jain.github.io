/**
 * Daily Briefs edge tools — REST surface for daily intelligence briefs.
 *
 * Endpoints (all under /api/v1/daily-briefs/):
 *   GET  /daily-briefs/                — slim index
 *   GET  /daily-briefs/:type           — list dates for brief type
 *   GET  /daily-briefs/:type/:date     — full brief body
 *   GET  /daily-briefs/stats           — cache + manifest stats
 *
 * Data source priority: KV (populated by cron) > ASSETS (static fallback).
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError, notFound } from '../lib/api-error';
import type { DbBriefBody } from '../lib/daily-briefs-manifest';

const KV_INDEX_KEY = 'db:index';
const KV_BODY_PREFIX = 'db:body';

// L1 per-colo Cache-API shadow for the index + bodies. The index flips only
// on the daily cron sync; bodies are immutable per (type,date). A 10-min
// shadow TTL collapses repeated reads to ~1 KV read per colo per window.
const DB_INDEX_SHADOW_TTL = 600;
const DB_BODY_SHADOW_TTL = 3600;
function dbIndexShadowReq(): Request {
  return new Request(`https://db-cache.internal/v1/${KV_INDEX_KEY}`);
}
function dbBodyShadowReq(type: string, date: string): Request {
  return new Request(`https://db-cache.internal/v1/${KV_BODY_PREFIX}:${type}:${date}`);
}

async function loadDbMod() {
  return await import('../lib/daily-briefs-manifest');
}

const VALID_TYPES = ['cyber', 'deepfake', 'disaster', 'maritime'] as const;

interface DbIndex {
  source: string;
  license: string;
  generatedAt: string;
  counts: { cyber: number; deepfake: number; disaster: number; maritime: number };
  briefs: { type: string; date: string; sizeBytes: number }[];
}

async function loadIndex(kv?: KVNamespace, assets?: Fetcher): Promise<DbIndex | null> {
  // L1: per-colo Cache-API shadow (free, no KV quota). The index only
  // changes on the daily cron, so a 10-min shadow is safe.
  const cache = (caches as unknown as { default: Cache }).default;
  if (kv) {
    try {
      const hit = await cache.match(dbIndexShadowReq());
      if (hit) {
        const idx = (await hit.json()) as DbIndex;
        if (idx?.briefs && idx.briefs.length > 0) return idx;
      }
    } catch {
      /* fall through to KV */
    }
    try {
      const raw = await kv.get(KV_INDEX_KEY, 'json');
      if (raw && typeof raw === 'object' && 'briefs' in (raw as DbIndex)) {
        const idx = raw as DbIndex;
        // If KV has a non-empty index, use it. If KV is empty (stale/cleared),
        // fall through to ASSETS which has the committed static manifest.
        if (idx.briefs && idx.briefs.length > 0) {
          // Write-through so the next read in this colo skips KV.
          try {
            await cache.put(
              dbIndexShadowReq(),
              new Response(JSON.stringify(idx), {
                headers: {
                  'content-type': 'application/json',
                  'cache-control': `public, max-age=${DB_INDEX_SHADOW_TTL}`,
                },
              })
            );
          } catch {
            /* best-effort shadow */
          }
          return idx;
        }
      }
    } catch {
      /* fall through */
    }
  }
  if (assets) {
    try {
      const mod = await loadDbMod();
      const idx = await mod.loadDbIndex(assets);
      return idx as unknown as DbIndex;
    } catch {
      /* fall through */
    }
  }
  return null;
}

async function loadBriefBody(
  kv?: KVNamespace,
  assets?: Fetcher,
  type?: string,
  date?: string
): Promise<DbBriefBody | null> {
  if (kv && type && date) {
    // L1: per-colo Cache-API shadow. Bodies are immutable per (type,date),
    // so a 1h shadow is safe and collapses repeated reads.
    const cache = (caches as unknown as { default: Cache }).default;
    const shadowReq = dbBodyShadowReq(type, date);
    try {
      const hit = await cache.match(shadowReq);
      if (hit) return await hit.json();
    } catch {
      /* fall through to KV */
    }
    try {
      const raw = await kv.get(`${KV_BODY_PREFIX}:${type}:${date}`, 'json');
      if (raw) {
        try {
          await cache.put(
            shadowReq,
            new Response(JSON.stringify(raw), {
              headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${DB_BODY_SHADOW_TTL}` },
            })
          );
        } catch {
          /* best-effort shadow */
        }
        return raw as DbBriefBody;
      }
    } catch {
      /* fall through */
    }
  }
  if (assets && type && date) {
    try {
      const mod = await loadDbMod();
      return await mod.getDbBrief(assets, type as Parameters<typeof mod.getDbBrief>[1], date);
    } catch {
      /* fall through */
    }
  }
  return null;
}

export const dailyBriefsRouter = new Hono<{ Bindings: Env }>();

// ─── Slim index ────────────────────────────────────────────────────────
dailyBriefsRouter.get('/daily-briefs/', async (c) => {
  try {
    const idx = await loadIndex(c.env.KV_CACHE, c.env.ASSETS);
    if (!idx) return internalError(c, 'db_index_failed: no data source available');
    return c.json({
      source: idx.source,
      license: idx.license,
      generatedAt: idx.generatedAt,
      counts: idx.counts,
      briefs: idx.briefs,
    });
  } catch (e) {
    logError('loadDbMod failed', e);
    return internalError(c, `db_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List dates for a brief type ───────────────────────────────────────
dailyBriefsRouter.get('/daily-briefs/:type', async (c) => {
  const type = c.req.param('type').toLowerCase();
  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return badRequest(c, `invalid_type: ${type} — must be cyber, deepfake, or disaster`);
  }
  try {
    const idx = await loadIndex(c.env.KV_CACHE, c.env.ASSETS);
    if (!idx) return internalError(c, 'db_list_failed: no data source available');
    const briefs = (idx.briefs ?? []).filter((b) => b.type === type);
    return c.json({ type, total: idx.counts[type as keyof typeof idx.counts], returned: briefs.length, briefs });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `db_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single brief body ─────────────────────────────────────────────────
dailyBriefsRouter.get('/daily-briefs/:type/:date', async (c) => {
  const type = c.req.param('type').toLowerCase();
  const date = c.req.param('date');
  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return badRequest(c, `invalid_type: ${type} — must be cyber, deepfake, or disaster`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return badRequest(c, `invalid_date: ${date} — must be YYYY-MM-DD`);
  }
  try {
    const body = await loadBriefBody(c.env.KV_CACHE, c.env.ASSETS, type, date);
    if (!body) return notFound(c, `brief_not_found: ${type}/${date}`);
    return c.json(body);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `db_brief_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ─────────────────────────────────────────────────────────────
dailyBriefsRouter.get('/daily-briefs/stats', async (c) => {
  try {
    const idx = await loadIndex(c.env.KV_CACHE, c.env.ASSETS);
    if (!idx) return internalError(c, 'db_stats_failed: no data source available');
    return c.json({
      counts: idx.counts,
      source: idx.source,
      license: idx.license,
      generatedAt: idx.generatedAt,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `db_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
