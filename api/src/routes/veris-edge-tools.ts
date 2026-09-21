import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/veris-manifest');
}

export const verisRouter = new Hono<{ Bindings: Env }>();

verisRouter.get('/veris/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadVerisIndex(c.env.ASSETS);
    return c.json({
      total: idx.count,
      sections: idx.sections,
      source: idx.source,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      cache: mod.verisCacheStats(),
    });
  } catch (e) {
    logError('loadMod failed', e);
    return internalError(c, `veris_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

verisRouter.get('/veris/sections', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadVerisIndex(c.env.ASSETS);
    return c.json({ sections: idx.sections });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `veris_sections_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

verisRouter.get('/veris', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadVerisIndex(c.env.ASSETS);
    const section = c.req.query('section') || undefined;
    const keyword = c.req.query('q') || undefined;
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : 200;
    const fields = mod.listVeris(idx, { section, keyword, limit });
    return c.json({ count: fields.length, total: idx.count, fields });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `veris_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

verisRouter.get('/veris/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const idx = await mod.loadVerisIndex(c.env.ASSETS);
    const field = mod.getVeris(idx, slug);
    if (!field) return notFound(c, `veris field '${slug}' not found`);
    return c.json(field);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `veris_get_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
