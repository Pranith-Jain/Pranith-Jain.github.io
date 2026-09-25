/**
 * Denali edge tools — REST surface for the evidence-led AI security
 * reference (transilienceai/denali, Apache-2.0).
 *
 * Endpoints (all under /api/v1/denali/):
 *   GET  /denali/               — slim index (counts + rules + docs)
 *   GET  /denali/rules          — deterministic rule catalog (kind, keyword)
 *   GET  /denali/rules/:uid     — full rule semantics (thresholds, evidence bounds)
 *   GET  /denali/taxonomy       — asset kinds, coverage states, severities, relationships
 *   GET  /denali/docs           — ADR/roadmap index (kind, keyword)
 *   GET  /denali/docs/:slug     — verbatim doc body (markdown)
 *   POST /denali/evaluate/activity — stateless checks over caller-supplied
 *            activity JSON: repeated failed AI sign-ins (3/24h), high-impact
 *            consent grants, retrieval→mutation sequences (5m window)
 *
 * Edge boundary: collectors, connectors, and snapshot evaluators need
 * Postgres + provider credentials and are reference-only here. The evaluate
 * endpoint covers the self-contained sliding-window rules as pure functions.
 *
 * All routes are automatically key-gated by the global /api/v1/* auth
 * middleware (authenticate('external-only')) in api/src/index.ts.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError, notFound } from '../lib/api-error';

async function loadDenaliMod() {
  return await import('../lib/denali-manifest');
}

export const denaliRouter = new Hono<{ Bindings: Env }>();

const ActivitySchema = z.object({
  category: z.string().max(80),
  outcome: z.string().max(20),
  occurredAt: z.string().max(40),
  actorUid: z.string().max(320).optional(),
  appId: z.string().max(320).optional(),
  session: z.string().max(320).optional(),
  operation: z.string().max(320).optional(),
  scopes: z.array(z.string().max(160)).max(100).optional(),
});

const EvaluateSchema = z.object({
  activities: z.array(ActivitySchema).min(1).max(500),
});

// ─── Slim index ────────────────────────────────────────────────────────
denaliRouter.get('/denali/', async (c) => {
  try {
    const mod = await loadDenaliMod();
    const idx = await mod.loadDenaliIndex(c.env.ASSETS);
    return c.json(idx);
  } catch (e) {
    logError('denali index failed', e);
    return internalError(c, `denali_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Rules ─────────────────────────────────────────────────────────────
denaliRouter.get('/denali/rules', async (c) => {
  try {
    const mod = await loadDenaliMod();
    const data = await mod.loadDenaliRules(c.env.ASSETS);
    const rules = mod.listDenaliRules(data, {
      kind: c.req.query('kind') || undefined,
      keyword: c.req.query('keyword') || c.req.query('q') || undefined,
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined,
    });
    return c.json({ total: data.total, kinds: data.kinds, returned: rules.length, source: data.source, rules });
  } catch (e) {
    logError('denali rules failed', e);
    return internalError(c, `denali_rules_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

denaliRouter.get('/denali/rules/:uid', async (c) => {
  try {
    const mod = await loadDenaliMod();
    const data = await mod.loadDenaliRules(c.env.ASSETS);
    const rule = mod.getDenaliRule(data, c.req.param('uid'));
    if (!rule) return notFound(c, `Denali rule '${c.req.param('uid')}' not found`);
    return c.json(rule);
  } catch (e) {
    logError('denali rule failed', e);
    return internalError(c, `denali_rule_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Taxonomy ──────────────────────────────────────────────────────────
denaliRouter.get('/denali/taxonomy', async (c) => {
  try {
    const mod = await loadDenaliMod();
    const tax = await mod.loadDenaliTaxonomy(c.env.ASSETS);
    return c.json(tax);
  } catch (e) {
    logError('denali taxonomy failed', e);
    return internalError(c, `denali_taxonomy_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Docs ──────────────────────────────────────────────────────────────
denaliRouter.get('/denali/docs', async (c) => {
  try {
    const mod = await loadDenaliMod();
    const docs = await mod.listDenaliDocs(c.env.ASSETS, {
      kind: c.req.query('kind') || undefined,
      keyword: c.req.query('keyword') || c.req.query('q') || undefined,
    });
    return c.json({ total: docs.length, docs });
  } catch (e) {
    logError('denali docs failed', e);
    return internalError(c, `denali_docs_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

denaliRouter.get('/denali/docs/:slug', async (c) => {
  try {
    const mod = await loadDenaliMod();
    const doc = await mod.getDenaliDoc(c.env.ASSETS, c.req.param('slug'));
    if (!doc) return notFound(c, `Denali doc '${c.req.param('slug')}' not found`);
    return c.json(doc);
  } catch (e) {
    logError('denali doc failed', e);
    return internalError(c, `denali_doc_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stateless evaluation ──────────────────────────────────────────────
denaliRouter.post('/denali/evaluate/activity', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return badRequest(c, 'invalid_json_body');
  }
  const parsed = EvaluateSchema.safeParse(body);
  if (!parsed.success) return badRequest(c, `invalid_body: ${parsed.error.message}`);
  try {
    const mod = await loadDenaliMod();
    const activities = parsed.data.activities;
    const signins = mod.evaluateFailedSignins(activities);
    const consents = activities
      .map((a) => ({ activity: a, verdict: mod.classifyConsent(a) }))
      .filter((x) => x.verdict.isHighImpactConsent);
    const sequences = mod.evaluateRiskySequences(activities);
    const findingCount = signins.candidates.length + consents.length + sequences.candidates.length;
    return c.json({
      activitiesEvaluated: activities.length,
      findingCount,
      failedSignins: signins,
      highImpactConsents: {
        count: consents.length,
        ruleUid: 'DENALI-RUNTIME-ENTRA-CONSENT-001',
        items: consents.map((x) => ({ operation: x.activity.operation, scopes: x.verdict.highImpactScopes })),
      },
      riskySequences: sequences,
      evidenceNote:
        'Sequence and identity only — no claim about intent, permission exercise, or execution. Unresolved references stay unresolved.',
    });
  } catch (e) {
    logError('denali evaluate failed', e);
    return internalError(c, `denali_evaluate_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
