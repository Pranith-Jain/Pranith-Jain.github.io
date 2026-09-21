import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/lots-manifest');
}

export const lotsRouter = new Hono<{ Bindings: Env }>();

lotsRouter.get('/lots/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadLotsIndex(c.env.ASSETS);
    return c.json({
      total: idx.count,
      tags: idx.tags,
      tagCounts: idx.tagCounts,
      source: idx.source,
      replicatedAt: idx.replicatedAt,
      cache: mod.lotsCacheStats(),
    });
  } catch (e) {
    logError('loadMod failed', e);
    return internalError(c, `lots_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

lotsRouter.get('/lots/tags', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadLotsIndex(c.env.ASSETS);
    return c.json({ tags: idx.tags, tagCounts: idx.tagCounts });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `lots_tags_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

lotsRouter.get('/lots', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadLotsIndex(c.env.ASSETS);
    const tag = c.req.query('tag') || undefined;
    const provider = c.req.query('provider') || undefined;
    const keyword = c.req.query('q') || undefined;
    const limit = c.req.query('limit') ? Math.min(500, Math.max(1, Number(c.req.query('limit')))) : 500;
    const sites = mod.listLots(idx, { tag, provider, keyword, limit });
    return c.json({ count: sites.length, total: idx.count, sites });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `lots_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

lotsRouter.get('/lots/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const idx = await mod.loadLotsIndex(c.env.ASSETS);
    const site = mod.getLots(idx, slug);
    if (!site) return notFound(c, `lots site '${slug}' not found`);
    return c.json(site);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `lots_get_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
