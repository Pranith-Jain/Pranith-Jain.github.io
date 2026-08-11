/**
 * Hunting Hypothesis Library edge tools — REST surface for hunting hypotheses.
 *
 * Endpoints (all under /api/v1/hunt-hypotheses/):
 *   GET  /hunt-hypotheses/             — slim index + counts
 *   GET  /hunt-hypotheses/hypotheses   — list hypotheses with filters
 *   GET  /hunt-hypotheses/hypotheses/:id — full hypothesis body
 *   GET  /hunt-hypotheses/tactics      — tactic breakdown
 *   GET  /hunt-hypotheses/stats        — cache + manifest stats
 *
 * Data source: authored hypothesis library (scripts/data-src/hunt-hypotheses).
 * Routes read from env.ASSETS — no D1, no KV, no public fetch.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadHuntMod() {
  return await import('../lib/hunt-hypotheses-manifest');
}

export const huntHypothesesRouter = new Hono<{ Bindings: Env }>();

// ─── Slim index ──────────────────────────────────────────────────────────
huntHypothesesRouter.get('/hunt-hypotheses/', async (c) => {
  try {
    const mod = await loadHuntMod();
    const idx = await mod.loadHuntHypothesesIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      counts: idx.counts,
      tactics: idx.tactics,
    });
  } catch (e) {
    logError('loadHuntMod failed', e);
    return internalError(c, `hunt_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List hypotheses ─────────────────────────────────────────────────────
huntHypothesesRouter.get('/hunt-hypotheses/hypotheses', async (c) => {
  try {
    const mod = await loadHuntMod();
    const idx = await mod.loadHuntHypothesesIndex(c.env.ASSETS);
    const tactic = c.req.query('tactic');
    const technique = c.req.query('technique');
    const keyword = c.req.query('keyword');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
    const hypotheses = mod.filterHuntHypotheses(idx, { tactic, technique, keyword, limit });
    return c.json({
      total: idx.counts.hypotheses,
      returned: hypotheses.length,
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      hypotheses,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `hunt_hypotheses_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single hypothesis ───────────────────────────────────────────────────
huntHypothesesRouter.get('/hunt-hypotheses/hypotheses/:id', async (c) => {
  try {
    const mod = await loadHuntMod();
    const id = c.req.param('id');
    const body = await mod.getHuntHypothesis(c.env.ASSETS, id);
    if (!body) {
      return notFound(c, `Hypothesis '${id}' not found`);
    }
    return c.json(body);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `hunt_hypothesis_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Tactics ─────────────────────────────────────────────────────────────
huntHypothesesRouter.get('/hunt-hypotheses/tactics', async (c) => {
  try {
    const mod = await loadHuntMod();
    const idx = await mod.loadHuntHypothesesIndex(c.env.ASSETS);
    return c.json({
      total: idx.tactics.length,
      source: idx.source,
      tactics: idx.tactics,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `hunt_tactics_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ───────────────────────────────────────────────────────────────
huntHypothesesRouter.get('/hunt-hypotheses/stats', async (c) => {
  try {
    const mod = await loadHuntMod();
    const idx = await mod.loadHuntHypothesesIndex(c.env.ASSETS);
    return c.json({
      counts: idx.counts,
      tactics: idx.tactics,
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      cache: mod.huntHypothesesCacheStats(),
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `hunt_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
