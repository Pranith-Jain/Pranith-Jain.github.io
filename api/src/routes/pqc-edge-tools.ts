/**
 * Post-Quantum Cryptography edge tools — REST surface for the PQC reference.
 *
 * Endpoints (all under /api/v1/pqc/):
 *   GET  /pqc/                 — slim index + counts
 *   GET  /pqc/algorithms       — list algorithms
 *   GET  /pqc/algorithms/:slug — full algorithm body
 *   GET  /pqc/classes          — crypto inventory risk classes + readiness
 *   GET  /pqc/stats            — cache + manifest stats
 *
 * Data source: NIST FIPS 203/204/205/206, NSA CNSSP-15 (summarized, authored
 * in scripts/data-src/pqc). Routes read from env.ASSETS — no D1, no KV, no
 * public fetch.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadPqcMod() {
  return await import('../lib/pqc-manifest');
}

export const pqcRouter = new Hono<{ Bindings: Env }>();

// ─── Slim index ──────────────────────────────────────────────────────────
pqcRouter.get('/pqc/', async (c) => {
  try {
    const mod = await loadPqcMod();
    const idx = await mod.loadPqcIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      counts: idx.counts,
      models: idx.models,
    });
  } catch (e) {
    logError('loadPqcMod failed', e);
    return internalError(c, `pqc_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List algorithms ─────────────────────────────────────────────────────
pqcRouter.get('/pqc/algorithms', async (c) => {
  try {
    const mod = await loadPqcMod();
    const idx = await mod.loadPqcIndex(c.env.ASSETS);
    return c.json({
      total: idx.counts.algorithms,
      source: idx.source,
      algorithms: idx.algorithmIndex,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `pqc_algorithms_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single algorithm ────────────────────────────────────────────────────
pqcRouter.get('/pqc/algorithms/:slug', async (c) => {
  try {
    const mod = await loadPqcMod();
    const slug = c.req.param('slug');
    const body = await mod.getPqcAlgorithm(c.env.ASSETS, slug);
    if (!body) {
      return notFound(c, `Algorithm '${slug}' not found`);
    }
    return c.json(body);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `pqc_algorithm_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Classes + readiness ─────────────────────────────────────────────────
pqcRouter.get('/pqc/classes', async (c) => {
  try {
    const mod = await loadPqcMod();
    const idx = await mod.loadPqcIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      cryptoClasses: idx.cryptoClasses,
      readiness: idx.readiness,
      hndl: idx.hndl,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `pqc_classes_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ───────────────────────────────────────────────────────────────
pqcRouter.get('/pqc/stats', async (c) => {
  try {
    const mod = await loadPqcMod();
    const idx = await mod.loadPqcIndex(c.env.ASSETS);
    return c.json({
      counts: idx.counts,
      models: idx.models,
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      cache: mod.pqcCacheStats(),
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `pqc_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
