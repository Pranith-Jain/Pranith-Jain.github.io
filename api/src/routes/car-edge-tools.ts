import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/car-manifest');
}

export const carRouter = new Hono<{ Bindings: Env }>();

carRouter.get('/car/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadCarIndex(c.env.ASSETS);
    return c.json({
      total: idx.count,
      techniqueCount: idx.techniqueCount,
      source: idx.source,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      cache: mod.carCacheStats(),
    });
  } catch (e) {
    logError('loadMod failed', e);
    return internalError(c, `car_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

carRouter.get('/car', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadCarIndex(c.env.ASSETS);
    const technique = c.req.query('technique') || undefined;
    const platform = c.req.query('platform') || undefined;
    const keyword = c.req.query('q') || undefined;
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : 200;
    const analytics = mod.listCar(idx, { technique, platform, keyword, limit });
    return c.json({ count: analytics.length, total: idx.count, analytics });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `car_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

carRouter.get('/car/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const idx = await mod.loadCarIndex(c.env.ASSETS);
    const analytic = mod.getCar(idx, slug);
    if (!analytic) return notFound(c, `car analytic '${slug}' not found`);
    return c.json(analytic);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `car_get_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
