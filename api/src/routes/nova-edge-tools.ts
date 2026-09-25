/**
 * NOVA edge tools — REST surface for prompt pattern matching
 * (Nova-Hunting/nova-framework engine + nova-rules collection, MIT).
 *
 * Endpoints (all under /api/v1/nova/):
 *   GET  /nova/              — slim index (counts + byCategory/bySeverity)
 *   GET  /nova/rules         — list rules (category, severity, keyword, keywordOnly, limit)
 *   GET  /nova/rules/:name   — full rule body (keywords/semantics/llm/condition)
 *   GET  /nova/taxonomy      — 4-category threat taxonomy (38 threats)
 *   POST /nova/scan          — scan a prompt (keywords stage on the edge;
 *                              semantics/llm patterns are gates, fail-closed)
 *
 * Edge boundary (mirrors upstream NovaMatcher): only `keywords` patterns
 * evaluate here. Rules whose condition could be flipped by an unevaluable
 * semantics/llm stage return verdict needs-semantics/needs-llm with
 * matched=false instead of a false negative.
 *
 * All routes are automatically key-gated by the global /api/v1/* auth
 * middleware (authenticate('external-only')) in api/src/index.ts.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError, notFound } from '../lib/api-error';

async function loadNovaMod() {
  return await import('../lib/nova-manifest');
}

export const novaRouter = new Hono<{ Bindings: Env }>();

const ScanSchema = z.object({
  prompt: z.string().min(1).max(50_000),
  rule: z.string().max(120).optional(),
  rules: z.array(z.string().max(120)).max(69).optional(),
  category: z.string().max(80).optional(),
  severity: z.string().max(20).optional(),
  keywordOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(69).optional(),
});

// ─── Slim index ────────────────────────────────────────────────────────
novaRouter.get('/nova/', async (c) => {
  try {
    const mod = await loadNovaMod();
    const idx = await mod.loadNovaIndex(c.env.ASSETS);
    return c.json(idx);
  } catch (e) {
    logError('nova index failed', e);
    return internalError(c, `nova_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List rules ────────────────────────────────────────────────────────
novaRouter.get('/nova/rules', async (c) => {
  try {
    const mod = await loadNovaMod();
    const idx = await mod.loadNovaIndex(c.env.ASSETS);
    const rules = mod.listNovaRules(idx, {
      category: c.req.query('category') || undefined,
      severity: c.req.query('severity') || undefined,
      keyword: c.req.query('keyword') || c.req.query('q') || undefined,
      keywordOnly: c.req.query('keywordOnly') === 'true' || undefined,
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined,
    });
    return c.json({ total: idx.counts.rules, returned: rules.length, source: idx.source, rules });
  } catch (e) {
    logError('nova rules failed', e);
    return internalError(c, `nova_rules_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single rule ───────────────────────────────────────────────────────
novaRouter.get('/nova/rules/:name', async (c) => {
  try {
    const mod = await loadNovaMod();
    const body = await mod.getNovaRule(c.env.ASSETS, c.req.param('name'));
    if (!body) return notFound(c, `NOVA rule '${c.req.param('name')}' not found`);
    return c.json(body);
  } catch (e) {
    logError('nova rule failed', e);
    return internalError(c, `nova_rule_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Taxonomy ──────────────────────────────────────────────────────────
novaRouter.get('/nova/taxonomy', async (c) => {
  try {
    const mod = await loadNovaMod();
    const tax = await mod.loadNovaTaxonomy(c.env.ASSETS);
    return c.json(tax);
  } catch (e) {
    logError('nova taxonomy failed', e);
    return internalError(c, `nova_taxonomy_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Scan ──────────────────────────────────────────────────────────────
novaRouter.post('/nova/scan', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, 'invalid_json_body');
  }
  const parsed = ScanSchema.safeParse(body);
  if (!parsed.success) return badRequest(c, `invalid_body: ${parsed.error.message}`);
  const { prompt, rule, rules, category, severity, keywordOnly, limit } = parsed.data;
  try {
    const mod = await loadNovaMod();
    const idx = await mod.loadNovaIndex(c.env.ASSETS);
    let slim = idx.rules;
    if (rule) slim = slim.filter((r) => r.name.toLowerCase() === rule.toLowerCase());
    if (rules && rules.length > 0) {
      const want = new Set(rules.map((r) => r.toLowerCase()));
      slim = slim.filter((r) => want.has(r.name.toLowerCase()));
    }
    if (category) slim = slim.filter((r) => (r.category ?? '').toLowerCase() === category.toLowerCase());
    if (severity) slim = slim.filter((r) => (r.severity ?? '').toLowerCase() === severity.toLowerCase());
    if (keywordOnly) slim = slim.filter((r) => r.keywordOnly);
    const cappedSlim = typeof limit === 'number' ? slim.slice(0, limit) : slim;
    if (cappedSlim.length === 0) return notFound(c, 'No NOVA rules match this filter');
    const full = (await Promise.all(cappedSlim.map((r) => mod.getNovaRule(c.env.ASSETS, r.name)))).filter(
      (r) => r !== null
    );
    const results = full.map((r) => mod.scanNovaPrompt(r, prompt));
    const matched = results.filter((r) => r.matched);
    const gated = results.filter((r) => r.verdict === 'needs-semantics' || r.verdict === 'needs-llm');
    return c.json({
      matched: matched.length > 0,
      rulesEvaluated: full.length,
      matchCount: matched.length,
      gatedCount: gated.length,
      matches: matched.map((m) => ({ rule: m.ruleName, matchingKeywords: m.matchingKeywords, condition: m.condition })),
      gated: gated.map((g) => ({ rule: g.ruleName, verdict: g.verdict, warnings: g.evaluationWarnings })),
      results,
    });
  } catch (e) {
    logError('nova scan failed', e);
    return internalError(c, `nova_scan_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
