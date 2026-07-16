/**
 * Breach Watch edge tools — REST surface for live breach/leak data.
 *
 * Endpoints (all under /api/v1/breach-watch/):
 *   GET  /breach-watch/                — slim index
 *   GET  /breach-watch/breaches        — list breaches (group, category, severity, days, keyword)
 *   GET  /breach-watch/breaches/:slug  — full breach body
 *   GET  /breach-watch/groups          — list threat actor groups with counts
 *   GET  /breach-watch/stats           — cache + manifest stats
 *
 * Data sourced from 6 free public trackers:
 *   ransomware.live + ransomlook.io + Darkfield + RecentBreaches.com +
 *   CTI.FYI + XposedOrNot. Routes read from env.ASSETS — no D1, no KV.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { internalError, notFound } from '../lib/api-error';

async function loadBwMod() {
  return await import('../lib/breach-watch-manifest');
}

export const breachWatchRouter = new Hono<{ Bindings: Env }>();

breachWatchRouter.get('/breach-watch/', async (c) => {
  try {
    const mod = await loadBwMod();
    const idx = await mod.loadBwIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      lastSyncedAt: idx.lastSyncedAt,
      counts: idx.counts,
      categories: idx.categories,
    });
  } catch (e) {
    console.error('loadBwMod failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `bw_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

breachWatchRouter.get('/breach-watch/breaches', async (c) => {
  try {
    const mod = await loadBwMod();
    const idx = await mod.loadBwIndex(c.env.ASSETS);
    const group = c.req.query('group');
    const category = c.req.query('category');
    const severity = c.req.query('severity');
    const country = c.req.query('country');
    const daysBack = c.req.query('days_back')
      ? Math.min(365, Math.max(1, Number(c.req.query('days_back'))))
      : undefined;
    const keyword = c.req.query('q');
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : undefined;

    const breaches = mod.filterBreaches(idx, {
      group: group || undefined,
      category: (category as any) || undefined,
      severity: (severity as any) || undefined,
      country: country || undefined,
      daysBack,
      keyword: keyword || undefined,
      limit,
    });
    return c.json({ total: idx.counts.breaches, returned: breaches.length, breaches });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `bw_breaches_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

breachWatchRouter.get('/breach-watch/breaches/:slug', async (c) => {
  const slug = c.req.param('slug');
  try {
    const mod = await loadBwMod();
    const body = await mod.getBwBreach(c.env.ASSETS, slug);
    if (!body) return notFound(c, `breach_not_found: ${slug}`);
    return c.json(body);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `bw_breach_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

breachWatchRouter.get('/breach-watch/groups', async (c) => {
  try {
    const mod = await loadBwMod();
    const idx = await mod.loadBwIndex(c.env.ASSETS);
    const keyword = c.req.query('q');
    const minCount = c.req.query('min_count') ? Number(c.req.query('min_count')) : undefined;
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : undefined;
    const groups = mod.listGroups(idx, { keyword: keyword || undefined, minCount, limit });
    return c.json({ total: idx.groups.length, returned: groups.length, groups });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `bw_groups_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

breachWatchRouter.get('/breach-watch/stats', async (c) => {
  try {
    const mod = await loadBwMod();
    const idx = await mod.loadBwIndex(c.env.ASSETS);
    return c.json({ counts: idx.counts, cache: mod.bwCacheStats() });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `bw_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
