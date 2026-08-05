/**
 * Webamon Daily Threat Brief — REST surface.
 *
 * Endpoints (all under /api/v1/webamon-dtb/):
 *   GET  /webamon-dtb/            — slim index
 *   GET  /webamon-dtb/briefs      — list briefs with filters
 *   GET  /webamon-dtb/briefs/:date — full brief body
 *   GET  /webamon-dtb/latest      — most recent brief
 *   GET  /webamon-dtb/stats       — cache + manifest stats
 *
 * Data read from env.ASSETS — no D1, no KV, no public fetch.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError, notFound } from '../lib/api-error';

async function loadWdtbMod() {
  return await import('../lib/webamon-dtb-manifest');
}

export const webamonDtbRouter = new Hono<{ Bindings: Env }>();

webamonDtbRouter.get('/webamon-dtb/', async (c) => {
  try {
    const mod = await loadWdtbMod();
    const idx = await mod.loadWdtbIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      license: idx.license,
      generatedAt: idx.generatedAt,
      counts: idx.counts,
    });
  } catch (e) {
    logError('loadWdtbMod failed', e);
    return internalError(c, `wdtb_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

webamonDtbRouter.get('/webamon-dtb/briefs', async (c) => {
  try {
    const mod = await loadWdtbMod();
    const idx = await mod.loadWdtbIndex(c.env.ASSETS);
    const dateFrom = c.req.query('date_from');
    const dateTo = c.req.query('date_to');
    const keyword = c.req.query('q');
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Math.min(200, Math.max(1, Number(limitRaw) || 50)) : 50;

    const briefs = mod.filterWdtbBriefs(idx, {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      keyword: keyword || undefined,
      limit,
    });
    return c.json({ total: idx.counts.briefs, returned: briefs.length, briefs });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `wdtb_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

webamonDtbRouter.get('/webamon-dtb/latest', async (c) => {
  try {
    const mod = await loadWdtbMod();
    const brief = await mod.getWdtbLatest(c.env.ASSETS);
    if (!brief) return notFound(c, 'no briefs available');
    return c.json(brief);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `wdtb_latest_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

webamonDtbRouter.get('/webamon-dtb/briefs/:date', async (c) => {
  try {
    const date = c.req.param('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest(c, 'date must be YYYY-MM-DD');
    const mod = await loadWdtbMod();
    const brief = await mod.getWdtbBrief(c.env.ASSETS, date);
    if (!brief) return notFound(c, `no brief for ${date}`);
    return c.json(brief);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `wdtb_get_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

webamonDtbRouter.get('/webamon-dtb/stats', async (c) => {
  try {
    const mod = await loadWdtbMod();
    const idx = await mod.loadWdtbIndex(c.env.ASSETS);
    return c.json({
      counts: idx.counts,
      generatedAt: idx.generatedAt,
      cache: mod.wdtbCacheStats(),
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `wdtb_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
