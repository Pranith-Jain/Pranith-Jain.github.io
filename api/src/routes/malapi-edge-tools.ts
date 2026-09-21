import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/malapi-manifest');
}

export const malapiRouter = new Hono<{ Bindings: Env }>();

malapiRouter.get('/malapi/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadMalapiIndex(c.env.ASSETS);
    return c.json({
      total: idx.count,
      categories: idx.categories,
      source: idx.source,
      replicatedAt: idx.replicatedAt,
      cache: mod.malapiCacheStats(),
    });
  } catch (e) {
    logError('loadMod failed', e);
    return internalError(c, `malapi_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

malapiRouter.get('/malapi/categories', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadMalapiIndex(c.env.ASSETS);
    return c.json({ categories: idx.categories });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `malapi_categories_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

malapiRouter.get('/malapi', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadMalapiIndex(c.env.ASSETS);
    const category = c.req.query('category') || undefined;
    const library = c.req.query('library') || undefined;
    const keyword = c.req.query('q') || undefined;
    const limit = c.req.query('limit') ? Math.min(500, Math.max(1, Number(c.req.query('limit')))) : 500;
    const apis = mod.listMalapi(idx, { category, library, keyword, limit });
    return c.json({ count: apis.length, total: idx.count, apis });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `malapi_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

malapiRouter.get('/malapi/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const idx = await mod.loadMalapiIndex(c.env.ASSETS);
    const api = mod.getMalapi(idx, slug);
    if (!api) return notFound(c, `malapi entry '${slug}' not found`);
    return c.json(api);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `malapi_get_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
