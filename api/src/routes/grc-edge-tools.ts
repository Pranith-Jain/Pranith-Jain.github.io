/**
 * GRC edge tools — REST surface for compliance checklists.
 *
 * Endpoints (all under /api/v1/grc/):
 *   GET  /grc/                     — slim framework index + mapper
 *   GET  /grc/frameworks           — list frameworks with filters (theme, keyword)
 *   GET  /grc/frameworks/:key      — full framework body (control lists)
 *   GET  /grc/mapper               — cross-framework control mapper
 *   GET  /grc/stats                — cache + manifest stats
 *
 * Data source: authored from public standards/regulations
 * (scripts/data-src/grc). Routes read from env.ASSETS — no D1, no KV, no
 * public fetch.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadGrcMod() {
  return await import('../lib/grc-manifest');
}

export const grcRouter = new Hono<{ Bindings: Env }>();

// ─── Slim index ──────────────────────────────────────────────────────────
grcRouter.get('/grc/', async (c) => {
  try {
    const mod = await loadGrcMod();
    const idx = await mod.loadGrcIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      counts: idx.counts,
      frameworks: idx.frameworks,
    });
  } catch (e) {
    logError('loadGrcMod failed', e);
    return internalError(c, `grc_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List frameworks ─────────────────────────────────────────────────────
grcRouter.get('/grc/frameworks', async (c) => {
  try {
    const mod = await loadGrcMod();
    const idx = await mod.loadGrcIndex(c.env.ASSETS);
    const theme = c.req.query('theme');
    const keyword = c.req.query('keyword');
    const frameworks = mod.filterGrcFrameworks(idx, { theme, keyword });
    return c.json({
      total: idx.counts.frameworks,
      returned: frameworks.length,
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      frameworks,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `grc_frameworks_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single framework ────────────────────────────────────────────────────
grcRouter.get('/grc/frameworks/:key', async (c) => {
  try {
    const mod = await loadGrcMod();
    const key = c.req.param('key');
    const body = await mod.getGrcFramework(c.env.ASSETS, key);
    if (!body) {
      return notFound(c, `Framework '${key}' not found`);
    }
    return c.json(body);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `grc_framework_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Mapper ──────────────────────────────────────────────────────────────
grcRouter.get('/grc/mapper', async (c) => {
  try {
    const mod = await loadGrcMod();
    const idx = await mod.loadGrcIndex(c.env.ASSETS);
    return c.json({
      total: idx.mapper.themes.length,
      source: idx.source,
      mapper: idx.mapper,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `grc_mapper_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ───────────────────────────────────────────────────────────────
grcRouter.get('/grc/stats', async (c) => {
  try {
    const mod = await loadGrcMod();
    const idx = await mod.loadGrcIndex(c.env.ASSETS);
    return c.json({
      counts: idx.counts,
      frameworks: idx.frameworks.map((f) => ({ key: f.key, name: f.name, controlCount: f.controlCount })),
      mapperThemes: idx.mapper.themes.length,
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      cache: mod.grcCacheStats(),
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `grc_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
