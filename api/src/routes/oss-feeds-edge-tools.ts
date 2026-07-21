/**
 * OSS Feed Registry edge tools — REST surface for open-source feed catalog.
 *
 * Endpoints (all under /api/v1/oss-feeds/):
 *   GET  /oss-feeds/              — slim index
 *   GET  /oss-feeds/feeds         — list feeds with filters
 *   GET  /oss-feeds/categories    — list available categories
 *   GET  /oss-feeds/categories/:cat — full per-category feed list with URLs
 *   GET  /oss-feeds/stats         — cache + manifest stats
 *
 * Source: github.com/Bert-JanP/Open-Source-Threat-Intel-Feeds (BSD-3-Clause)
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { internalError, notFound } from '../lib/api-error';

async function loadOssMod() {
  return await import('../lib/oss-feeds-manifest');
}

export const ossFeedsRouter = new Hono<{ Bindings: Env }>();

ossFeedsRouter.get('/oss-feeds/', async (c) => {
  try {
    const mod = await loadOssMod();
    const idx = await mod.loadOssFeedsIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      lastSyncedAt: idx.lastSyncedAt,
      counts: idx.counts,
      categories: idx.categories,
    });
  } catch (e) {
    console.error('loadOssMod failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `oss_feeds_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

ossFeedsRouter.get('/oss-feeds/feeds', async (c) => {
  try {
    const mod = await loadOssMod();
    const idx = await mod.loadOssFeedsIndex(c.env.ASSETS);
    const vendor = c.req.query('vendor');
    const category = c.req.query('category');
    const status = c.req.query('status');
    const keyword = c.req.query('q');
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : undefined;
    const feeds = mod.filterFeeds(idx, {
      vendor: vendor || undefined,
      category: category || undefined,
      status: status || undefined,
      keyword: keyword || undefined,
      limit,
    });
    return c.json({ total: idx.counts.total, returned: feeds.length, feeds });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `oss_feeds_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

ossFeedsRouter.get('/oss-feeds/categories', async (c) => {
  try {
    const mod = await loadOssMod();
    const idx = await mod.loadOssFeedsIndex(c.env.ASSETS);
    return c.json({ total: idx.categories.length, categories: idx.categories });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `oss_feeds_categories_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

ossFeedsRouter.get('/oss-feeds/categories/:cat', async (c) => {
  const cat = c.req.param('cat');
  try {
    const mod = await loadOssMod();
    const body = await mod.getOssFeedsByCategory(c.env.ASSETS, cat);
    if (!body) return notFound(c, `oss_category_not_found: ${cat}`);
    return c.json(body);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `oss_feeds_category_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

ossFeedsRouter.get('/oss-feeds/stats', async (c) => {
  try {
    const mod = await loadOssMod();
    const idx = await mod.loadOssFeedsIndex(c.env.ASSETS);
    const cache = mod.ossFeedsCacheStats();
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
    return internalError(c, `oss_feeds_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
