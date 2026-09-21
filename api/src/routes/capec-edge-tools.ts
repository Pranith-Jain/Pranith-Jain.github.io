import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/capec-manifest');
}

export const capecRouter = new Hono<{ Bindings: Env }>();

capecRouter.get('/capec/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadCapecIndex(c.env.ASSETS);
    return c.json({
      total: idx.count,
      byAbstraction: idx.byAbstraction,
      byStatus: idx.byStatus,
      source: idx.source,
      replicatedAt: idx.replicatedAt,
      cache: mod.capecCacheStats(),
    });
  } catch (e) {
    logError('loadMod failed', e);
    return internalError(c, `capec_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

capecRouter.get('/capec', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadCapecIndex(c.env.ASSETS);
    const abstraction = c.req.query('abstraction') || undefined;
    const status = c.req.query('status') || undefined;
    const domain = c.req.query('domain') || undefined;
    const cwe = c.req.query('cwe') || undefined;
    const technique = c.req.query('technique') || undefined;
    const keyword = c.req.query('q') || undefined;
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : 200;
    const patterns = mod.listCapec(idx, { abstraction, status, domain, cwe, technique, keyword, limit });
    return c.json({ count: patterns.length, total: idx.count, patterns });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `capec_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

capecRouter.get('/capec/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const idx = await mod.loadCapecIndex(c.env.ASSETS);
    const pattern = mod.getCapec(idx, slug);
    if (!pattern) return notFound(c, `capec pattern '${slug}' not found`);
    return c.json(pattern);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `capec_get_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
