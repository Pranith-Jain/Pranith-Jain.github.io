/**
 * AI Threat Actors edge tools — REST surface for AI-in-threat-actor data.
 *
 * Endpoints (all under /api/v1/ai-threats/):
 *   GET  /ai-threats/              — slim index
 *   GET  /ai-threats/entries       — list entries with filters
 *   GET  /ai-threats/entries/:slug — full entry body
 *   GET  /ai-threats/stats         — cache + manifest stats
 *
 * Source: cybershujin.github.io/Threat-Actors-use-of-Artifical-Intelligence/
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { internalError, notFound } from '../lib/api-error';

async function loadAiMod() {
  return await import('../lib/ai-threats-manifest');
}

export const aiThreatsRouter = new Hono<{ Bindings: Env }>();

aiThreatsRouter.get('/ai-threats/', async (c) => {
  try {
    const mod = await loadAiMod();
    const idx = await mod.loadAiThreatsIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      lastSyncedAt: idx.lastSyncedAt,
      counts: idx.counts,
      stixAvailable: idx.stixAvailable,
    });
  } catch (e) {
    console.error('loadAiMod failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `ai_threats_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiThreatsRouter.get('/ai-threats/entries', async (c) => {
  try {
    const mod = await loadAiMod();
    const idx = await mod.loadAiThreatsIndex(c.env.ASSETS);
    const table = c.req.query('table');
    const category = c.req.query('category');
    const ttp = c.req.query('ttp');
    const keyword = c.req.query('q');
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : undefined;
    const entries = mod.filterThreats(idx, {
      table: table || undefined,
      category: category || undefined,
      ttp: ttp || undefined,
      keyword: keyword || undefined,
      limit,
    });
    return c.json({ total: idx.counts.total, returned: entries.length, entries });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `ai_threats_entries_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiThreatsRouter.get('/ai-threats/entries/:slug', async (c) => {
  const slug = c.req.param('slug');
  try {
    const mod = await loadAiMod();
    const body = await mod.getAiThreat(c.env.ASSETS, slug);
    if (!body) return notFound(c, `ai_threat_not_found: ${slug}`);
    return c.json(body);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `ai_threat_entry_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiThreatsRouter.get('/ai-threats/stats', async (c) => {
  try {
    const mod = await loadAiMod();
    const idx = await mod.loadAiThreatsIndex(c.env.ASSETS);
    const cache = mod.aiThreatsCacheStats();
    return c.json({
      counts: idx.counts,
      source: idx.source,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      lastSyncedAt: idx.lastSyncedAt,
      cache,
    });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `ai_threats_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
