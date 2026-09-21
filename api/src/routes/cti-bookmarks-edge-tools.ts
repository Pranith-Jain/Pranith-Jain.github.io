import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/cti-bookmarks-manifest');
}

export const ctiBookmarksRouter = new Hono<{ Bindings: Env }>();

ctiBookmarksRouter.get('/cti-bookmarks/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadCtiBookmarksIndex(c.env.ASSETS);
    return c.json({
      total: idx.count,
      levels: idx.levels,
      categories: idx.categories,
      statusCounts: idx.statusCounts,
      source: idx.source,
      replicatedAt: idx.replicatedAt,
      cache: mod.ctiBookmarksCacheStats(),
    });
  } catch (e) {
    logError('loadMod failed', e);
    return internalError(c, `cti_bookmarks_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

ctiBookmarksRouter.get('/cti-bookmarks/categories', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadCtiBookmarksIndex(c.env.ASSETS);
    return c.json({ count: idx.categories.length, categories: idx.categories });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `cti_bookmarks_categories_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

ctiBookmarksRouter.get('/cti-bookmarks', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadCtiBookmarksIndex(c.env.ASSETS);
    const level = c.req.query('level') || undefined;
    const category = c.req.query('category') || undefined;
    const status = c.req.query('status') as 'live' | 'reference' | 'missing' | undefined;
    const keyword = c.req.query('q') || undefined;
    const limit = c.req.query('limit') ? Math.min(500, Math.max(1, Number(c.req.query('limit')))) : 500;
    const bookmarks = mod.listBookmarks(idx, { level, category, status, keyword, limit });
    return c.json({ count: bookmarks.length, total: idx.count, bookmarks });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `cti_bookmarks_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

ctiBookmarksRouter.get('/cti-bookmarks/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const idx = await mod.loadCtiBookmarksIndex(c.env.ASSETS);
    const bookmark = mod.getBookmark(idx, slug);
    if (!bookmark) return notFound(c, `bookmark '${slug}' not found`);
    return c.json(bookmark);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `cti_bookmarks_get_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
