/**
 * CAIRN edge tools — REST surface for the Cognitive Artifact Intelligence
 * Research Network (Cisco-Talos, MIT).
 *
 * Endpoints (all under /api/v1/cairn/):
 *   GET  /cairn/              — slim index (counts + rules + families)
 *   GET  /cairn/rules         — list rules (tier, family, keyword, limit)
 *   GET  /cairn/rules/:name   — full rule body (strings + condition)
 *   GET  /cairn/families      — list families (archetype, keyword)
 *   GET  /cairn/families/:slug — full family report (markdown body)
 *   GET  /cairn/filters       — acquisition channels (category, enabledOnly, keyword)
 *   GET  /cairn/archetypes    — A0–A11 taxonomy
 *   POST /cairn/scan          — run tiered rules over pasted scan text
 *
 * Data source: github.com/Cisco-Talos/Cognitive-Artifact-Intelligence-Research-Network (MIT).
 * The engine is pure local substring matching (port of cairn/rules.py).
 *
 * All routes are automatically key-gated by the global /api/v1/* auth
 * middleware (authenticate('external-only')) in api/src/index.ts.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError, notFound } from '../lib/api-error';

async function loadCairnMod() {
  return await import('../lib/cairn-manifest');
}

export const cairnRouter = new Hono<{ Bindings: Env }>();

const ScanSchema = z.object({
  text: z.string().min(1).max(200_000),
  tier: z.enum(['T1', 'T2', 'T3']).optional(),
  rule: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(26).optional(),
});

// ─── Slim index ────────────────────────────────────────────────────────
cairnRouter.get('/cairn/', async (c) => {
  try {
    const mod = await loadCairnMod();
    const idx = await mod.loadCairnIndex(c.env.ASSETS);
    return c.json(idx);
  } catch (e) {
    logError('cairn index failed', e);
    return internalError(c, `cairn_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List rules ────────────────────────────────────────────────────────
cairnRouter.get('/cairn/rules', async (c) => {
  try {
    const mod = await loadCairnMod();
    const idx = await mod.loadCairnIndex(c.env.ASSETS);
    const rules = mod.listCairnRules(idx, {
      tier: c.req.query('tier') || undefined,
      family: c.req.query('family') || undefined,
      keyword: c.req.query('keyword') || c.req.query('q') || undefined,
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined,
    });
    return c.json({ total: idx.counts.rules, returned: rules.length, source: idx.source, rules });
  } catch (e) {
    logError('cairn rules failed', e);
    return internalError(c, `cairn_rules_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single rule ───────────────────────────────────────────────────────
cairnRouter.get('/cairn/rules/:name', async (c) => {
  try {
    const mod = await loadCairnMod();
    const body = await mod.getCairnRule(c.env.ASSETS, c.req.param('name'));
    if (!body) return notFound(c, `CAIRN rule '${c.req.param('name')}' not found`);
    return c.json(body);
  } catch (e) {
    logError('cairn rule failed', e);
    return internalError(c, `cairn_rule_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Families ──────────────────────────────────────────────────────────
cairnRouter.get('/cairn/families', async (c) => {
  try {
    const mod = await loadCairnMod();
    const families = await mod.listCairnFamilies(c.env.ASSETS, {
      archetype: c.req.query('archetype') || undefined,
      keyword: c.req.query('keyword') || c.req.query('q') || undefined,
    });
    return c.json({ total: families.length, families });
  } catch (e) {
    logError('cairn families failed', e);
    return internalError(c, `cairn_families_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

cairnRouter.get('/cairn/families/:slug', async (c) => {
  try {
    const mod = await loadCairnMod();
    const body = await mod.getCairnFamily(c.env.ASSETS, c.req.param('slug'));
    if (!body) return notFound(c, `CAIRN family '${c.req.param('slug')}' not found`);
    return c.json(body);
  } catch (e) {
    logError('cairn family failed', e);
    return internalError(c, `cairn_family_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Acquisition filters ───────────────────────────────────────────────
cairnRouter.get('/cairn/filters', async (c) => {
  try {
    const mod = await loadCairnMod();
    const data = await mod.loadCairnFilters(c.env.ASSETS);
    const filters = mod.filterCairnFilters(data, {
      category: c.req.query('category') || undefined,
      enabledOnly: c.req.query('enabled') === 'true' || c.req.query('enabledOnly') === 'true' || undefined,
      keyword: c.req.query('keyword') || c.req.query('q') || undefined,
    });
    return c.json({
      total: data.total,
      enabled: data.enabled,
      categories: data.categories,
      returned: filters.length,
      source: data.source,
      sourceUrl: data.sourceUrl,
      filters,
    });
  } catch (e) {
    logError('cairn filters failed', e);
    return internalError(c, `cairn_filters_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Archetypes ────────────────────────────────────────────────────────
cairnRouter.get('/cairn/archetypes', async (c) => {
  try {
    const mod = await loadCairnMod();
    const data = await mod.loadCairnArchetypes(c.env.ASSETS);
    return c.json(data);
  } catch (e) {
    logError('cairn archetypes failed', e);
    return internalError(c, `cairn_archetypes_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Scan ──────────────────────────────────────────────────────────────
cairnRouter.post('/cairn/scan', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, 'invalid_json_body');
  }
  const parsed = ScanSchema.safeParse(body);
  if (!parsed.success) return badRequest(c, `invalid_body: ${parsed.error.message}`);
  const { text, tier, rule, limit } = parsed.data;
  try {
    const mod = await loadCairnMod();
    const idx = await mod.loadCairnIndex(c.env.ASSETS);
    let names = idx.rules.map((r) => r.name);
    if (rule) names = names.filter((n) => n.toLowerCase() === rule.toLowerCase());
    if (tier) names = names.filter((n) => idx.rules.find((r) => r.name === n)?.tier === tier);
    if (names.length === 0)
      return notFound(c, rule ? `CAIRN rule '${rule}' not found` : 'No CAIRN rules match this filter');
    const full = (await Promise.all(names.map((n) => mod.getCairnRule(c.env.ASSETS, n)))).filter((r) => r !== null);
    const matches = mod.scanCairnText(full, text);
    const capped = typeof limit === 'number' ? matches.slice(0, limit) : matches;
    const tiers = [...new Set(capped.map((m) => m.tier))];
    return c.json({
      matched: capped.length > 0,
      rulesEvaluated: full.length,
      matchCount: capped.length,
      topTier: tiers.includes('T3') ? 'T3' : tiers.includes('T2') ? 'T2' : tiers.includes('T1') ? 'T1' : null,
      families: [...new Set(capped.map((m) => m.family).filter(Boolean))],
      matches: capped,
    });
  } catch (e) {
    logError('cairn scan failed', e);
    return internalError(c, `cairn_scan_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
