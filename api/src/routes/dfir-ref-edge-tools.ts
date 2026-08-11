/**
 * DFIR Reference edge tools — REST surface for practitioner reference data.
 *
 * Endpoints (all under /api/v1/dfir-ref/):
 *   GET  /dfir-ref/            — slim index + counts
 *   GET  /dfir-ref/items       — list items with filters (category, keyword, mitre)
 *   GET  /dfir-ref/items/:slug — full item body
 *   GET  /dfir-ref/categories  — list categories
 *   GET  /dfir-ref/stats       — cache + manifest stats
 *
 * Data source: authored reference data (scripts/data-src/dfir-ref).
 * Routes read from env.ASSETS — no D1, no KV, no public fetch.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadDfirRefMod() {
  return await import('../lib/dfir-ref-manifest');
}

export const dfirRefRouter = new Hono<{ Bindings: Env }>();

// ─── Slim index ──────────────────────────────────────────────────────────
dfirRefRouter.get('/dfir-ref/', async (c) => {
  try {
    const mod = await loadDfirRefMod();
    const idx = await mod.loadDfirRefIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      counts: idx.counts,
      categories: idx.categories,
    });
  } catch (e) {
    logError('loadDfirRefMod failed', e);
    return internalError(c, `dfirref_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List items ──────────────────────────────────────────────────────────
dfirRefRouter.get('/dfir-ref/items', async (c) => {
  try {
    const mod = await loadDfirRefMod();
    const idx = await mod.loadDfirRefIndex(c.env.ASSETS);
    const category = c.req.query('category');
    const keyword = c.req.query('keyword');
    const mitre = c.req.query('mitre');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
    const items = mod.filterDfirRefItems(idx, { category, keyword, mitre, limit });
    return c.json({
      total: idx.metadata.totalItems,
      returned: items.length,
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      items,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `dfirref_items_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single item ─────────────────────────────────────────────────────────
dfirRefRouter.get('/dfir-ref/items/:slug', async (c) => {
  try {
    const mod = await loadDfirRefMod();
    const slug = c.req.param('slug');
    const body = await mod.getDfirRefItem(c.env.ASSETS, slug);
    if (!body) {
      return notFound(c, `DFIR Ref item '${slug}' not found`);
    }
    return c.json(body);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `dfirref_item_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Categories ──────────────────────────────────────────────────────────
dfirRefRouter.get('/dfir-ref/categories', async (c) => {
  try {
    const mod = await loadDfirRefMod();
    const idx = await mod.loadDfirRefIndex(c.env.ASSETS);
    return c.json({
      total: idx.categories.length,
      source: idx.source,
      categories: idx.categories,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `dfirref_categories_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ───────────────────────────────────────────────────────────────
dfirRefRouter.get('/dfir-ref/stats', async (c) => {
  try {
    const mod = await loadDfirRefMod();
    const idx = await mod.loadDfirRefIndex(c.env.ASSETS);
    return c.json({
      counts: idx.counts,
      categories: idx.categories,
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      cache: mod.dfirRefCacheStats(),
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `dfirref_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
