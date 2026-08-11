/**
 * SIEM Use-Case Library edge tools — REST surface for detection use-cases.
 *
 * Endpoints (all under /api/v1/siem-library/):
 *   GET  /siem-library/            — slim index + counts
 *   GET  /siem-library/use-cases   — list use-cases with filters
 *   GET  /siem-library/use-cases/:id — full use-case body
 *   GET  /siem-library/categories  — list categories + severity/technique counts
 *   GET  /siem-library/stats       — cache + manifest stats
 *
 * Data source: authored detection library (scripts/data-src/siem-library).
 * Routes read from env.ASSETS — no D1, no KV, no public fetch.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadSiemMod() {
  return await import('../lib/siem-library-manifest');
}

export const siemLibraryRouter = new Hono<{ Bindings: Env }>();

// ─── Slim index ──────────────────────────────────────────────────────────
siemLibraryRouter.get('/siem-library/', async (c) => {
  try {
    const mod = await loadSiemMod();
    const idx = await mod.loadSiemLibraryIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      counts: idx.counts,
      categories: idx.categories,
      severities: idx.severities,
    });
  } catch (e) {
    logError('loadSiemMod failed', e);
    return internalError(c, `siem_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List use-cases ──────────────────────────────────────────────────────
siemLibraryRouter.get('/siem-library/use-cases', async (c) => {
  try {
    const mod = await loadSiemMod();
    const idx = await mod.loadSiemLibraryIndex(c.env.ASSETS);
    const category = c.req.query('category');
    const mitre = c.req.query('mitre');
    const severity = c.req.query('severity');
    const keyword = c.req.query('keyword');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
    const useCases = mod.filterSiemUseCases(idx, { category, mitre, severity, keyword, limit });
    return c.json({
      total: idx.counts.useCases,
      returned: useCases.length,
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      useCases,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `siem_use_cases_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single use-case ─────────────────────────────────────────────────────
siemLibraryRouter.get('/siem-library/use-cases/:id', async (c) => {
  try {
    const mod = await loadSiemMod();
    const id = c.req.param('id');
    const body = await mod.getSiemUseCase(c.env.ASSETS, id);
    if (!body) {
      return notFound(c, `Use case '${id}' not found`);
    }
    return c.json(body);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `siem_use_case_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Categories ──────────────────────────────────────────────────────────
siemLibraryRouter.get('/siem-library/categories', async (c) => {
  try {
    const mod = await loadSiemMod();
    const idx = await mod.loadSiemLibraryIndex(c.env.ASSETS);
    return c.json({
      total: idx.categories.length,
      source: idx.source,
      categories: idx.categories,
      severities: idx.severities,
      techniques: idx.techniques,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `siem_categories_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ───────────────────────────────────────────────────────────────
siemLibraryRouter.get('/siem-library/stats', async (c) => {
  try {
    const mod = await loadSiemMod();
    const idx = await mod.loadSiemLibraryIndex(c.env.ASSETS);
    return c.json({
      counts: idx.counts,
      categories: idx.categories,
      severities: idx.severities,
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      cache: mod.siemLibraryCacheStats(),
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `siem_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
