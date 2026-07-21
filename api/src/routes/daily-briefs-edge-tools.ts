/**
 * Daily Briefs edge tools — REST surface for daily intelligence briefs.
 *
 * Endpoints (all under /api/v1/daily-briefs/):
 *   GET  /daily-briefs/                — slim index
 *   GET  /daily-briefs/:type           — list dates for brief type
 *   GET  /daily-briefs/:type/:date     — full brief body
 *   GET  /daily-briefs/stats           — cache + manifest stats
 *
 * The actual logic lives in worker/lib/daily-briefs-manifest.ts (symlinked).
 * Routes read from env.ASSETS — no D1, no KV, no public fetch.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { badRequest, internalError, notFound } from '../lib/api-error';

async function loadDbMod() {
  return await import('../lib/daily-briefs-manifest');
}

const VALID_TYPES = ['cyber', 'deepfake', 'disaster'] as const;

export const dailyBriefsRouter = new Hono<{ Bindings: Env }>();

// ─── Slim index ────────────────────────────────────────────────────────
dailyBriefsRouter.get('/daily-briefs/', async (c) => {
  try {
    const mod = await loadDbMod();
    const idx = await mod.loadDbIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      license: idx.license,
      generatedAt: idx.generatedAt,
      counts: idx.counts,
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
    const mod = await loadDbMod();
    const idx = await mod.loadDbIndex(c.env.ASSETS);
    const dateFrom = c.req.query('date_from');
    const dateTo = c.req.query('date_to');
    const limit = c.req.query('limit') ? Math.min(365, Math.max(1, Number(c.req.query('limit')))) : undefined;

    const briefs = mod.filterBriefs(idx, {
      type: type as any,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit,
    });
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
    const mod = await loadDbMod();
    const body = await mod.getDbBrief(c.env.ASSETS, type as any, date);
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
    const mod = await loadDbMod();
    const idx = await mod.loadDbIndex(c.env.ASSETS);
    const cache = mod.dbCacheStats();
    return c.json({
      counts: idx.counts,
      source: idx.source,
      license: idx.license,
      generatedAt: idx.generatedAt,
      cache,
    });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `db_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
