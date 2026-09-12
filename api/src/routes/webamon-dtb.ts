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
import { trackEvent } from '../lib/analytics';
import {
  summarizeWdtbBrief,
  buildWdtbPrompt,
  aiChat,
  readCachedAnalysis,
  writeCachedAnalysis,
  type DigestAnalysis,
} from '../lib/digest-ai';

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

/**
 * GET /webamon-dtb/briefs/:date/analysis — deterministic brief read plus a
 * best-effort LLM analyst note. Briefs are immutable per date, so the full
 * payload (including any generated narrative) is cached indefinitely
 * (Cache API + KV). Zero D1; generation tracked via Analytics Engine.
 */
webamonDtbRouter.get('/webamon-dtb/briefs/:date/analysis', async (c) => {
  try {
    const date = c.req.param('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return badRequest(c, 'date must be YYYY-MM-DD');
    const cached = await readCachedAnalysis('wdtb', date, c.env.KV_CACHE);
    if (cached) {
      return c.json({ ...cached, cached: true }, 200, { 'cache-control': 'public, max-age=86400' });
    }
    const mod = await loadWdtbMod();
    const brief = await mod.getWdtbBrief(c.env.ASSETS, date);
    if (!brief) return notFound(c, `no brief for ${date}`);
    const { bullets, stats } = summarizeWdtbBrief(brief);
    const analysis: DigestAnalysis = {
      kind: 'wdtb',
      date,
      generated_at: new Date().toISOString(),
      bullets,
      stats,
      ai: null,
    };
    try {
      const { system, user } = buildWdtbPrompt(brief, bullets);
      const { text, model } = await aiChat(c.env, system, user);
      analysis.ai = { text, model };
    } catch (e) {
      analysis.ai_error = e instanceof Error ? e.message : String(e);
    }
    try {
      trackEvent(c.env, 'digest_analysis', { blobs: ['wdtb', analysis.ai ? 'ai' : 'deterministic'], doubles: [bullets.length] });
    } catch {
      /* analytics best-effort */
    }
    await writeCachedAnalysis(analysis, c.env.KV_CACHE);
    return c.json({ ...analysis, cached: false }, 200, { 'cache-control': 'public, max-age=86400' });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `wdtb_analysis_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
