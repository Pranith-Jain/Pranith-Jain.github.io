/**
 * Cloud Security Reference edge tools — REST surface for SRM + cloud hunt queries.
 *
 * Endpoints (all under /api/v1/cloud-ref/):
 *   GET  /cloud-ref/            — slim index + provider counts
 *   GET  /cloud-ref/srm         — full shared responsibility matrix
 *   GET  /cloud-ref/queries     — list hunt queries with filters
 *   GET  /cloud-ref/queries/:id — full query body
 *   GET  /cloud-ref/stats       — cache + manifest stats
 *
 * Data source: authored reference (scripts/data-src/cloud-ref).
 * Routes read from env.ASSETS — no D1, no KV, no public fetch.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadCloudRefMod() {
  return await import('../lib/cloud-ref-manifest');
}

export const cloudRefRouter = new Hono<{ Bindings: Env }>();

// ─── Slim index ──────────────────────────────────────────────────────────
cloudRefRouter.get('/cloud-ref/', async (c) => {
  try {
    const mod = await loadCloudRefMod();
    const idx = await mod.loadCloudRefIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      counts: idx.counts,
      providerCounts: idx.providerCounts,
    });
  } catch (e) {
    logError('loadCloudRefMod failed', e);
    return internalError(c, `cloudref_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Shared responsibility matrix ────────────────────────────────────────
cloudRefRouter.get('/cloud-ref/srm', async (c) => {
  try {
    const mod = await loadCloudRefMod();
    const idx = await mod.loadCloudRefIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      srm: idx.srm,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `cloudref_srm_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List queries ────────────────────────────────────────────────────────
cloudRefRouter.get('/cloud-ref/queries', async (c) => {
  try {
    const mod = await loadCloudRefMod();
    const idx = await mod.loadCloudRefIndex(c.env.ASSETS);
    const provider = c.req.query('provider');
    const mitre = c.req.query('mitre');
    const keyword = c.req.query('keyword');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
    const queries = mod.filterCloudQueries(idx, { provider, mitre, keyword, limit });
    return c.json({
      total: idx.counts.queries,
      returned: queries.length,
      source: idx.source,
      providerCounts: idx.providerCounts,
      queries,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `cloudref_queries_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single query ────────────────────────────────────────────────────────
cloudRefRouter.get('/cloud-ref/queries/:id', async (c) => {
  try {
    const mod = await loadCloudRefMod();
    const id = c.req.param('id');
    const body = await mod.getCloudHuntQuery(c.env.ASSETS, id);
    if (!body) {
      return notFound(c, `Cloud hunt query '${id}' not found`);
    }
    return c.json(body);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `cloudref_query_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ───────────────────────────────────────────────────────────────
cloudRefRouter.get('/cloud-ref/stats', async (c) => {
  try {
    const mod = await loadCloudRefMod();
    const idx = await mod.loadCloudRefIndex(c.env.ASSETS);
    return c.json({
      counts: idx.counts,
      providerCounts: idx.providerCounts,
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      cache: mod.cloudRefCacheStats(),
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `cloudref_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
