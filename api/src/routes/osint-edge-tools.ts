import { Hono } from 'hono';
import type { Env } from '../env';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/osint-manifest');
}

export const osintRouter = new Hono<{ Bindings: Env }>();

osintRouter.get('/osint/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadOsintIndex(c.env.ASSETS);
    return c.json({
      total: idx.count,
      categories: [...new Set(idx.entries.map((e: { category: string }) => e.category))].sort(),
      cache: mod.osintCacheStats(),
    });
  } catch (e) {
    return internalError(c, `osint_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

osintRouter.get('/osint', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadOsintIndex(c.env.ASSETS);
    const category = c.req.query('category') as string | undefined;
    const keyword = c.req.query('q');
    const freeOnly = c.req.query('free') === 'true' ? true : undefined;
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : undefined;
    const portals = mod.listPortals(idx, { category: category as any, keyword, freeOnly, limit });
    return c.json({ count: portals.length, portals });
  } catch (e) {
    return internalError(c, `osint_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

osintRouter.get('/osint/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const idx = await mod.loadOsintIndex(c.env.ASSETS);
    const portal = mod.getPortal(idx, slug);
    if (!portal) return notFound(c, `Portal '${slug}' not found`);
    return c.json(portal);
  } catch (e) {
    return internalError(c, `osint_get_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
