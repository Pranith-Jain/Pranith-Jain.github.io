/**
 * Signature-Base edge tools — REST surface for the Neo23x0 YARA rule set + IOCs.
 *
 * Endpoints (all under /api/v1/sigbase/):
 *   GET  /sigbase/             — slim index
 *   GET  /sigbase/rules        — list YARA rule files with filters
 *   GET  /sigbase/rules/:slug  — full YARA rule file body
 *   GET  /sigbase/iocs         — list IOC lists
 *   GET  /sigbase/iocs/:slug   — full IOC list entries
 *   GET  /sigbase/stats        — cache + manifest stats
 *
 * Data source: github.com/Neo23x0/signature-base (DRL 1.1)
 *
 * The actual logic lives in worker/lib/sigbase-manifest.ts (copied to
 * api/src/lib/sigbase-manifest.ts). Routes read from env.ASSETS — no
 * D1, no KV, no public fetch.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadSigBaseMod() {
  return await import('../lib/sigbase-manifest');
}

export const sigBaseRouter = new Hono<{ Bindings: Env }>();

// ─── Slim index ──────────────────────────────────────────────────────────
sigBaseRouter.get('/sigbase/', async (c) => {
  try {
    const mod = await loadSigBaseMod();
    const idx = await mod.loadSigBaseIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      counts: idx.counts,
    });
  } catch (e) {
    logError('loadSigBaseMod failed', e);
    return internalError(c, `sigbase_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List YARA rule files ────────────────────────────────────────────────
sigBaseRouter.get('/sigbase/rules', async (c) => {
  try {
    const mod = await loadSigBaseMod();
    const idx = await mod.loadSigBaseIndex(c.env.ASSETS);
    const tag = c.req.query('tag');
    const author = c.req.query('author');
    const keyword = c.req.query('keyword');
    const externalVars = c.req.query('externalVars') === 'true' ? true : undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
    const rules = mod.filterYara(idx, { tag, author, keyword, externalVars, limit });
    return c.json({
      total: idx.counts.yaraFiles,
      totalRules: idx.counts.yaraRules,
      returned: rules.length,
      source: idx.source,
      license: idx.license,
      rules,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `sigbase_rules_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single YARA rule file ───────────────────────────────────────────────
sigBaseRouter.get('/sigbase/rules/:slug', async (c) => {
  try {
    const mod = await loadSigBaseMod();
    const slug = c.req.param('slug');
    const body = await mod.getSigBaseYara(c.env.ASSETS, slug);
    if (!body) {
      return notFound(c, `YARA rule file '${slug}' not found`);
    }
    return c.json(body);
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `sigbase_rule_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List IOC lists ──────────────────────────────────────────────────────
sigBaseRouter.get('/sigbase/iocs', async (c) => {
  try {
    const mod = await loadSigBaseMod();
    const idx = await mod.loadSigBaseIndex(c.env.ASSETS);
    const type = c.req.query('type') as 'hash' | 'c2' | 'filename' | 'keyword' | undefined;
    const keyword = c.req.query('keyword');
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined;
    const lists = mod.filterIocs(idx, { type: type as 'hash' | 'c2' | 'filename' | 'keyword', keyword, limit });
    return c.json({
      total: idx.counts.iocFiles,
      totalEntries: idx.counts.iocEntries,
      returned: lists.length,
      source: idx.source,
      license: idx.license,
      lists,
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `sigbase_iocs_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single IOC list ─────────────────────────────────────────────────────
sigBaseRouter.get('/sigbase/iocs/:slug', async (c) => {
  try {
    const mod = await loadSigBaseMod();
    const slug = c.req.param('slug');
    const body = await mod.getSigBaseIoc(c.env.ASSETS, slug);
    if (!body) {
      return notFound(c, `IOC list '${slug}' not found`);
    }
    const keyword = c.req.query('keyword');
    const entries = keyword ? mod.searchIocEntries(body, keyword) : body.entries;
    return c.json({ ...body, total: body.entryCount, returned: entries.length, entries });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `sigbase_ioc_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ───────────────────────────────────────────────────────────────
sigBaseRouter.get('/sigbase/stats', async (c) => {
  try {
    const mod = await loadSigBaseMod();
    const idx = await mod.loadSigBaseIndex(c.env.ASSETS);
    return c.json({
      counts: idx.counts,
      source: idx.source,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      cache: mod.sigBaseCacheStats(),
    });
  } catch (e) {
    logError('handler failed', e);
    return internalError(c, `sigbase_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
