import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/engage-manifest');
}

export const engageRouter = new Hono<{ Bindings: Env }>();

engageRouter.get('/engage/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadEngageIndex(c.env.ASSETS);
    return c.json({
      total: idx.count,
      phases: idx.phases,
      goals: idx.goals,
      source: idx.source,
      replicatedAt: idx.replicatedAt,
      cache: mod.engageCacheStats(),
    });
  } catch (e) {
    logError('loadMod failed', e);
    return internalError(c, `engage_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

engageRouter.get('/engage/goals', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadEngageIndex(c.env.ASSETS);
    return c.json({ goals: idx.goals, phases: idx.phases });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `engage_goals_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

engageRouter.get('/engage', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadEngageIndex(c.env.ASSETS);
    const goal = c.req.query('goal') || undefined;
    const phase = c.req.query('phase') || undefined;
    const keyword = c.req.query('q') || undefined;
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : 200;
    const approaches = mod.listEngage(idx, { goal, phase, keyword, limit });
    return c.json({ count: approaches.length, total: idx.count, approaches });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `engage_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

engageRouter.get('/engage/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const idx = await mod.loadEngageIndex(c.env.ASSETS);
    const approach = mod.getEngage(idx, slug);
    if (!approach) return notFound(c, `engage approach '${slug}' not found`);
    return c.json(approach);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `engage_get_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
