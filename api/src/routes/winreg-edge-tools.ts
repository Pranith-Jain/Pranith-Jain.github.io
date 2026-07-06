/**
 * WinReg DFIR edge tools — REST surface for Windows Registry forensic artifacts.
 *
 * Endpoints (all under /api/v1/winreg/):
 *   GET  /winreg/                   — slim index
 *   GET  /winreg/artifacts          — list artifacts with filters
 *   GET  /winreg/artifacts/:slug    — full artifact body
 *   GET  /winreg/categories         — list categories
 *   GET  /winreg/stats              — cache + manifest stats
 *
 * Data source: github.com/dfir-scripts/dfir-scripts.github.io (MIT)
 * Upstream: https://dfir-scripts.github.io/registry/
 *
 * The actual logic lives in worker/lib/winreg-manifest.ts (symlinked).
 * Routes read from env.ASSETS — no D1, no KV, no public fetch.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { internalError, notFound } from '../lib/api-error';

async function loadWinRegMod() {
  return await import('../lib/winreg-manifest');
}

export const winRegRouter = new Hono<{ Bindings: Env }>();

// ─── Slim index ──────────────────────────────────────────────────────────
winRegRouter.get('/winreg/', async (c) => {
  try {
    const mod = await loadWinRegMod();
    const idx = await mod.loadWinRegIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      counts: idx.counts,
      categories: idx.categories,
    });
  } catch (e) {
    return internalError(c, `winreg_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List artifacts ──────────────────────────────────────────────────────
winRegRouter.get('/winreg/artifacts', async (c) => {
  try {
    const mod = await loadWinRegMod();
    const idx = await mod.loadWinRegIndex(c.env.ASSETS);
    const category = c.req.query('category');
    const hive = c.req.query('hive');
    const technique = c.req.query('technique');
    const keyword = c.req.query('keyword');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
    const artifacts = mod.filterArtifacts(idx, { category, hive, technique, keyword, limit });
    return c.json({
      total: idx.counts.artifacts,
      returned: artifacts.length,
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      artifacts,
    });
  } catch (e) {
    return internalError(c, `winreg_artifacts_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single artifact ─────────────────────────────────────────────────────
winRegRouter.get('/winreg/artifacts/:slug', async (c) => {
  try {
    const mod = await loadWinRegMod();
    const slug = c.req.param('slug');
    const body = await mod.getWinRegArtifact(c.env.ASSETS, slug);
    if (!body) {
      return notFound(c, `Artifact '${slug}' not found`);
    }
    return c.json(body);
  } catch (e) {
    return internalError(c, `winreg_artifact_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Categories ──────────────────────────────────────────────────────────
winRegRouter.get('/winreg/categories', async (c) => {
  try {
    const mod = await loadWinRegMod();
    const idx = await mod.loadWinRegIndex(c.env.ASSETS);
    return c.json({
      total: idx.categories.length,
      source: idx.source,
      categories: idx.categories,
    });
  } catch (e) {
    return internalError(c, `winreg_categories_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ───────────────────────────────────────────────────────────────
winRegRouter.get('/winreg/stats', async (c) => {
  try {
    const mod = await loadWinRegMod();
    const idx = await mod.loadWinRegIndex(c.env.ASSETS);
    return c.json({
      counts: idx.counts,
      hives: idx.hives,
      tactics: idx.tactics,
      techniques: idx.techniques,
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      cache: mod.winRegCacheStats(),
    });
  } catch (e) {
    return internalError(c, `winreg_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
