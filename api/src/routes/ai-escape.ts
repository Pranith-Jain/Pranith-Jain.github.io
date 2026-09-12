/**
 * AI Escape Watch — REST surface for the agent-containment-failure registry.
 *
 * All read-only, served from the static ASSETS manifest (no per-request
 * upstream, no secrets):
 *   GET  /ai-escape/              — registry meta + stats + guardrail counts
 *   GET  /ai-escape/incidents     — registry rows (klass, sev, tier, guardrail,
 *                                    autonomous, q, limit)
 *   GET  /ai-escape/incidents/:id — full docket (chain, sources, disputed)
 *   GET  /ai-escape/guardrails    — 10 control definitions
 *   GET  /ai-escape/trackers      — provenance table
 *   GET  /ai-escape/timeline      — month buckets for the chronology strip
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/ai-escape-manifest');
}

export const aiEscapeRouter = new Hono<{ Bindings: Env }>();

aiEscapeRouter.get('/ai-escape/', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadEscapeIndex(c.env.ASSETS);
    return c.json({
      registry: idx.registry,
      version: idx.version,
      compiled: idx.compiled,
      builtAt: idx.builtAt,
      cbsScale: idx.cbsScale,
      stats: idx.stats,
      guardrailCounts: idx.guardrailCounts,
    });
  } catch (e) {
    logError('ai-escape index failed', e);
    return internalError(c, `ai_escape_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiEscapeRouter.get('/ai-escape/incidents', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadEscapeIndex(c.env.ASSETS);
    const klass = c.req.query('klass');
    const sev = c.req.query('sev');
    const tier = c.req.query('tier');
    const auto = c.req.query('autonomous');
    const entries = mod.filterEscapes(idx, {
      klass:
        klass === 'containment-breach' ||
        klass === 'agent-hijack' ||
        klass === 'supply-chain' ||
        klass === 'tool-misuse' ||
        klass === 'injection'
          ? klass
          : undefined,
      sev: sev === 'critical' || sev === 'severe' || sev === 'notable' || sev === 'contained' ? sev : undefined,
      tier: tier === 'A' || tier === 'B' || tier === 'C' || tier === 'D' || tier === 'X' ? tier : undefined,
      guardrail: c.req.query('guardrail') || undefined,
      autonomous: auto === 'true' ? true : auto === 'false' ? false : undefined,
      q: c.req.query('q') || undefined,
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : 100,
    });
    return c.json({ total: idx.stats.entries, returned: entries.length, incidents: entries });
  } catch (e) {
    logError('ai-escape list failed', e);
    return internalError(c, `ai_escape_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiEscapeRouter.get('/ai-escape/incidents/:id', async (c) => {
  const id = c.req.param('id').toUpperCase();
  try {
    const mod = await loadMod();
    const body = await mod.getEscapeIncident(c.env.ASSETS, id);
    if (!body) return notFound(c, `ai_escape_not_found: ${id}`);
    return c.json(body);
  } catch (e) {
    logError('ai-escape docket failed', e);
    return internalError(c, `ai_escape_docket_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiEscapeRouter.get('/ai-escape/guardrails', async (c) => {
  try {
    const mod = await loadMod();
    const assets = c.env.ASSETS;
    const [guardrails, idx] = await Promise.all([mod.loadEscapeGuardrails(assets), mod.loadEscapeIndex(assets)]);
    return c.json({ guardrails, counts: idx.guardrailCounts, total: idx.stats.entries });
  } catch (e) {
    logError('ai-escape guardrails failed', e);
    return internalError(c, `ai_escape_guardrails_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiEscapeRouter.get('/ai-escape/trackers', async (c) => {
  try {
    const mod = await loadMod();
    const trackers = await mod.loadEscapeTrackers(c.env.ASSETS);
    return c.json({ total: trackers.length, trackers });
  } catch (e) {
    logError('ai-escape trackers failed', e);
    return internalError(c, `ai_escape_trackers_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiEscapeRouter.get('/ai-escape/timeline', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadEscapeIndex(c.env.ASSETS);
    return c.json({ buckets: mod.escapeTimelineBuckets(idx) });
  } catch (e) {
    logError('ai-escape timeline failed', e);
    return internalError(c, `ai_escape_timeline_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
