/**
 * AI Security Playbook edge tools — REST surface for the taxonomy index
 * replicated from aisecurity.zone.
 *
 * LICENCE SCOPE: upstream declares NO reuse licence (no LICENSE file, /terms/
 * and /license/ 404, and the repository named in its CONTRIBUTING page returns
 * 404). These endpoints therefore serve STRUCTURE ONLY — the 8-layer system
 * model, the 20 published risk identifiers (OWASP LLM01-10 and the author's
 * ASI01-10), and public CVE identifiers enriched from our own synced CISA KEV
 * feed. No chapter prose, no diagram bodies, no upstream text. Every record
 * carries a deep link to the original.
 *
 * If the author later publishes a CC-BY-SA licence, bodies can be added to
 * scripts/build-ai-playbook.mjs and a /ai-playbook/chapters/:slug route
 * alongside these; nothing here would need to change.
 *
 * Endpoints (all under /api/v1/ai-playbook/):
 *   GET /ai-playbook/          — slim index (counts + layers + risk identifiers)
 *   GET /ai-playbook/layers    — the 8 system divisions
 *   GET /ai-playbook/layers/:id — one layer by id (I..VIII) or slug
 *   GET /ai-playbook/risk-ids  — 20 identifiers; filter by scheme/layer, search q
 *   GET /ai-playbook/risk-ids/:id — one identifier
 *   GET /ai-playbook/cves      — observed CVE references joined to local KEV
 *   GET /ai-playbook/stats     — counts, KEV matches, cache state
 *
 * All routes are automatically key-gated by the global /api/v1/* auth
 * middleware in api/src/index.ts.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/ai-playbook-manifest');
}

export const aiPlaybookRouter = new Hono<{ Bindings: Env }>();

function intParam(raw: string | undefined, fallback?: number): number | undefined {
  if (raw === undefined) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ─── Slim index ────────────────────────────────────────────────────────
aiPlaybookRouter.get('/ai-playbook/', async (c) => {
  try {
    const mod = await loadMod();
    return c.json(await mod.loadAiPlaybookIndex(c.env.ASSETS));
  } catch (e) {
    logError('ai-playbook index failed', e);
    return internalError(c, `ai_playbook_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Layers ────────────────────────────────────────────────────────────
aiPlaybookRouter.get('/ai-playbook/layers', async (c) => {
  try {
    const mod = await loadMod();
    const layers = await mod.listAiPlaybookLayers(c.env.ASSETS);
    return c.json({ total: layers.length, layers });
  } catch (e) {
    logError('ai-playbook layers failed', e);
    return internalError(c, `ai_playbook_layers_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiPlaybookRouter.get('/ai-playbook/layers/:id', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadAiPlaybookIndex(c.env.ASSETS);
    const layer = await mod.getAiPlaybookLayer(c.env.ASSETS, c.req.param('id'));
    if (!layer) return notFound(c, `AI Playbook layer '${c.req.param('id')}' not found`);
    // Include the identifiers this division defines so the client does not need
    // a second round-trip to render the layer card.
    return c.json({ ...layer, riskIdsDetailed: mod.riskIdsForLayer(idx, layer.id) });
  } catch (e) {
    logError('ai-playbook layer failed', e);
    return internalError(c, `ai_playbook_layer_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Risk identifiers ─────────────────────────────────────────────────
aiPlaybookRouter.get('/ai-playbook/risk-ids', async (c) => {
  try {
    const mod = await loadMod();
    const scheme = c.req.query('scheme');
    if (scheme && scheme !== 'owasp-llm' && scheme !== 'agentic-asi') {
      return badRequest(c, `scheme must be 'owasp-llm' or 'agentic-asi'`);
    }
    const ids = await mod.filterAiPlaybookRiskIds(c.env.ASSETS, {
      scheme: (scheme as 'owasp-llm' | 'agentic-asi' | undefined) || undefined,
      layer: c.req.query('layer') || undefined,
      q: c.req.query('q') || c.req.query('keyword') || undefined,
      limit: intParam(c.req.query('limit')),
    });
    return c.json({ total: ids.length, scope: 'structure-only', riskIds: ids });
  } catch (e) {
    logError('ai-playbook risk-ids failed', e);
    return internalError(c, `ai_playbook_risk_ids_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

aiPlaybookRouter.get('/ai-playbook/risk-ids/:id', async (c) => {
  try {
    const mod = await loadMod();
    const risk = await mod.getAiPlaybookRiskId(c.env.ASSETS, c.req.param('id'));
    if (!risk) return notFound(c, `AI Playbook risk identifier '${c.req.param('id')}' not found`);
    return c.json(risk);
  } catch (e) {
    logError('ai-playbook risk-id failed', e);
    return internalError(c, `ai_playbook_risk_id_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── CVE references (enriched from OUR KEV feed, never upstream) ──────
aiPlaybookRouter.get('/ai-playbook/cves', async (c) => {
  try {
    const mod = await loadMod();
    const refs = await mod.getAiPlaybookCveRefs(c.env.ASSETS);
    const kevOnly = c.req.query('kev') === 'true';
    const out = kevOnly ? refs.filter((r) => r.kev) : refs;
    return c.json({
      total: out.length,
      kevMatched: refs.filter((r) => r.kev).length,
      enrichmentSource: 'local CISA KEV snapshot (public/data/threat-intel/cves/kev.json)',
      cves: out,
    });
  } catch (e) {
    logError('ai-playbook cves failed', e);
    return internalError(c, `ai_playbook_cves_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ─────────────────────────────────────────────────────────────
aiPlaybookRouter.get('/ai-playbook/stats', async (c) => {
  try {
    const mod = await loadMod();
    return c.json(await mod.aiPlaybookStats(c.env.ASSETS));
  } catch (e) {
    logError('ai-playbook stats failed', e);
    return internalError(c, `ai_playbook_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});