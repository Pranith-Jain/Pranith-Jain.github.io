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
import { badRequest, internalError, notFound } from '../lib/api-error';

const KV_INDEX_KEY = 'db:index';
const KV_BODY_PREFIX = 'db:body';

async function loadDbMod() {
  return await import('../lib/daily-briefs-manifest');
}

const VALID_TYPES = ['cyber', 'deepfake', 'disaster'] as const;

interface DbIndex {
  source: string;
  license: string;
  generatedAt: string;
  counts: { cyber: number; deepfake: number; disaster: number };
  briefs: { type: string; date: string; sizeBytes: number }[];
}

async function loadIndex(kv?: KVNamespace, assets?: Fetcher): Promise<DbIndex | null> {
  if (kv) {
    try {
      const raw = await kv.get(KV_INDEX_KEY, 'json');
      if (raw && typeof raw === 'object' && 'briefs' in (raw as DbIndex)) return raw as DbIndex;
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

async function loadBriefBody(kv?: KVNamespace, assets?: Fetcher, type?: string, date?: string): Promise<any | null> {
  if (kv && type && date) {
    try {
      const raw = await kv.get(`${KV_BODY_PREFIX}:${type}:${date}`, 'json');
      if (raw) return raw;
    } catch {
      /* fall through */
    }
  }
  if (assets && type && date) {
    try {
      const mod = await loadDbMod();
      return await mod.getDbBrief(assets, type as any, date);
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
    console.error('loadDbMod failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `db_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List dates for a brief type ───────────────────────────────────────
dailyBriefsRouter.get('/daily-briefs/:type', async (c) => {
  const type = c.req.param('type').toLowerCase();
  if (!VALID_TYPES.includes(type as any)) {
    return badRequest(c, `invalid_type: ${type} — must be cyber, deepfake, or disaster`);
  }
  try {
    const idx = await loadIndex(c.env.KV_CACHE, c.env.ASSETS);
    if (!idx) return internalError(c, 'db_list_failed: no data source available');
    const briefs = (idx.briefs ?? []).filter((b) => b.type === type);
    return c.json({ type, total: idx.counts[type as keyof typeof idx.counts], returned: briefs.length, briefs });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `db_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single brief body ─────────────────────────────────────────────────
dailyBriefsRouter.get('/daily-briefs/:type/:date', async (c) => {
  const type = c.req.param('type').toLowerCase();
  const date = c.req.param('date');
  if (!VALID_TYPES.includes(type as any)) {
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
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
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
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `db_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
