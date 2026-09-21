import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/hijacklibs-manifest');
}

export const hijacklibsRouter = new Hono<{ Bindings: Env }>();

hijacklibsRouter.get('/hijacklibs/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadHijacklibsIndex(c.env.ASSETS);
    return c.json({
      total: idx.count,
      hijackTypes: idx.hijackTypes,
      typeCounts: idx.typeCounts,
      withCve: idx.withCve,
      source: idx.source,
      replicatedAt: idx.replicatedAt,
      cache: mod.hijacklibsCacheStats(),
    });
  } catch (e) {
    logError('loadMod failed', e);
    return internalError(c, `hijacklibs_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

hijacklibsRouter.get('/hijacklibs', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadHijacklibsIndex(c.env.ASSETS);
    const type = c.req.query('type') || undefined;
    const vendor = c.req.query('vendor') || undefined;
    const cveOnly = c.req.query('cve') === 'true' ? true : undefined;
    const keyword = c.req.query('q') || undefined;
    const limit = c.req.query('limit') ? Math.min(500, Math.max(1, Number(c.req.query('limit')))) : 500;
    const dlls = mod.listHijacklibs(idx, { type, vendor, cveOnly, keyword, limit });
    return c.json({ count: dlls.length, total: idx.count, dlls });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `hijacklibs_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

hijacklibsRouter.get('/hijacklibs/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const idx = await mod.loadHijacklibsIndex(c.env.ASSETS);
    const dll = mod.getHijacklib(idx, slug);
    if (!dll) return notFound(c, `hijacklib '${slug}' not found`);
    return c.json(dll);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `hijacklibs_get_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
