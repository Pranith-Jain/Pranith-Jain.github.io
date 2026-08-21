/**
 * Detection Wiki edge tools — REST surface for detection.wiki mirror.
 *
 * Endpoints (all under /api/v1/detection-wiki/):
 *   GET  /detection-wiki/                      — slim index + stats
 *   GET  /detection-wiki/techniques            — list techniques with filters (tactic, q, limit)
 *   GET  /detection-wiki/techniques/:id        — single technique
 *   GET  /detection-wiki/platforms             — list platforms
 *   GET  /detection-wiki/windows               — windows catalog (providers summary)
 *   GET  /detection-wiki/windows/providers     — list windows providers (q, hasRules, limit)
 *   GET  /detection-wiki/windows/providers/:slug — single provider
 *   GET  /detection-wiki/security-auditing     — list security-auditing events (q, tactic, hasSample, hasRule, limit)
 *   GET  /detection-wiki/security-auditing/:id — single event
 *   GET  /detection-wiki/labs                  — list labs
 *   GET  /detection-wiki/labs/:slug            — single lab body with KQL
 *   GET  /detection-wiki/filters               — vendor/platform/domain/status metadata
 *   GET  /detection-wiki/stats                 — cache + manifest stats
 *
 * Data source: https://detection.wiki (public, Cloudflare-protected, fetched via Playwright)
 * The actual logic lives in worker/lib/detection-wiki-manifest.ts (symlinked).
 * Routes read from env.ASSETS — no D1, no KV, no public fetch.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/detection-wiki-manifest');
}

export const detectionWikiRouter = new Hono<{ Bindings: Env }>();

// ─── Slim index ───────────────────────────────────────────────────────
detectionWikiRouter.get('/detection-wiki/', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadDwIndex(c.env.ASSETS);
    return c.json(idx);
  } catch (e) {
    logError('dw index failed', e);
    return internalError(c, `dw_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Techniques ───────────────────────────────────────────────────────
detectionWikiRouter.get('/detection-wiki/techniques', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadDwTechniques(c.env.ASSETS);
    const tactic = c.req.query('tactic') ?? undefined;
    const q = c.req.query('q') ?? undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 100;
    const minRules = c.req.query('min_rules') ? parseInt(c.req.query('min_rules')!, 10) : undefined;
    const includeSub = c.req.query('subtechniques') !== 'false';
    const filtered = mod.filterDwTechniques(idx.all, { tactic, q, minRules, subtechniques: includeSub });
    return c.json({
      total: idx.all.length,
      returned: Math.min(filtered.length, limit),
      techniques: filtered.slice(0, limit),
      matrix_tactics: idx.matrix.length,
    });
  } catch (e) {
    logError('dw techniques failed', e);
    return internalError(c, `dw_techniques_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

detectionWikiRouter.get('/detection-wiki/techniques/:id', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadDwTechniques(c.env.ASSETS);
    const id = c.req.param('id');
    const found = idx.all.find((t) => t.id.toLowerCase() === id.toLowerCase());
    if (!found) return notFound(c, `Technique '${id}' not found`);
    // enrich with matrix entry
    const col = idx.matrix.find((m) => m.techniques.some((t) => t.id === found.id));
    return c.json({ ...found, tactic_total_rules: col?.totalRules ?? null });
  } catch (e) {
    logError('dw technique failed', e);
    return internalError(c, `dw_technique_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Platforms ────────────────────────────────────────────────────────
detectionWikiRouter.get('/detection-wiki/platforms', async (c) => {
  try {
    const mod = await loadMod();
    const platforms = await mod.loadDwPlatforms(c.env.ASSETS);
    return c.json({ total: platforms.length, platforms });
  } catch (e) {
    logError('dw platforms failed', e);
    return internalError(c, `dw_platforms_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Windows catalog ──────────────────────────────────────────────────
detectionWikiRouter.get('/detection-wiki/windows', async (c) => {
  try {
    const mod = await loadMod();
    const cat = await mod.loadDwWindows(c.env.ASSETS);
    if (!cat) return notFound(c, 'Windows catalog not found');
    return c.json(cat);
  } catch (e) {
    logError('dw windows failed', e);
    return internalError(c, `dw_windows_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

detectionWikiRouter.get('/detection-wiki/windows/providers', async (c) => {
  try {
    const mod = await loadMod();
    const cat = await mod.loadDwWindows(c.env.ASSETS);
    if (!cat) return notFound(c, 'Windows catalog not found');
    const q = c.req.query('q') ?? undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
    const hasRules = c.req.query('has_rules') ? c.req.query('has_rules') === 'true' : undefined;
    const filtered = mod.filterDwWindowsProviders(cat.providers, { q, hasRules, limit });
    return c.json({
      totalProviders: cat.totalProviders,
      sampledProviders: cat.providers.length,
      returned: filtered.length,
      providers: filtered,
    });
  } catch (e) {
    logError('dw windows providers failed', e);
    return internalError(c, `dw_windows_providers_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

detectionWikiRouter.get('/detection-wiki/windows/providers/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const cat = await mod.loadDwWindows(c.env.ASSETS);
    if (!cat) return notFound(c, 'Windows catalog not found');
    const slug = c.req.param('slug');
    const prov = cat.providers.find((p) => p.slug.toLowerCase() === slug.toLowerCase());
    if (!prov) return notFound(c, `Provider '${slug}' not found`);
    return c.json(prov);
  } catch (e) {
    logError('dw windows provider failed', e);
    return internalError(c, `dw_windows_provider_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Security Auditing ────────────────────────────────────────────────
detectionWikiRouter.get('/detection-wiki/security-auditing', async (c) => {
  try {
    const mod = await loadMod();
    const cat = await mod.loadDwSecurityAuditing(c.env.ASSETS);
    if (!cat) return notFound(c, 'Security-Auditing catalog not found');
    const q = c.req.query('q') ?? undefined;
    const tactic = c.req.query('tactic') ?? undefined;
    const hasSample = c.req.query('has_sample') ? c.req.query('has_sample') === 'true' : undefined;
    const hasRule = c.req.query('has_rule') ? c.req.query('has_rule') === 'true' : undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 100;
    const filtered = mod.filterDwSecurityAuditingEvents(cat.events, { q, tactic, hasSample, hasRule, limit });
    return c.json({
      provider: cat.provider,
      channel: cat.channel,
      totalEvents: cat.eventCount,
      returned: filtered.length,
      events: filtered,
    });
  } catch (e) {
    logError('dw security auditing failed', e);
    return internalError(c, `dw_security_auditing_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

detectionWikiRouter.get('/detection-wiki/security-auditing/:id', async (c) => {
  try {
    const mod = await loadMod();
    const cat = await mod.loadDwSecurityAuditing(c.env.ASSETS);
    if (!cat) return notFound(c, 'Security-Auditing catalog not found');
    const id = parseInt(c.req.param('id'), 10);
    const ev = cat.events.find((e) => e.id === id);
    if (!ev) return notFound(c, `Event '${id}' not found`);
    return c.json(ev);
  } catch (e) {
    logError('dw security auditing event failed', e);
    return internalError(c, `dw_security_auditing_event_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Labs ─────────────────────────────────────────────────────────────
detectionWikiRouter.get('/detection-wiki/labs', async (c) => {
  try {
    const mod = await loadMod();
    const labs = await mod.loadDwLabs(c.env.ASSETS);
    const q = c.req.query('q') ?? undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
    const filtered = q
      ? labs.filter((l) =>
          `${l.title} ${l.description} ${l.techniques.join(' ')}`.toLowerCase().includes(q.toLowerCase())
        )
      : labs;
    return c.json({ total: labs.length, returned: Math.min(filtered.length, limit), labs: filtered.slice(0, limit) });
  } catch (e) {
    logError('dw labs failed', e);
    return internalError(c, `dw_labs_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

detectionWikiRouter.get('/detection-wiki/labs/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const body = await mod.getDwLab(c.env.ASSETS, slug);
    if (!body) return notFound(c, `Lab '${slug}' not found`);
    return c.json(body);
  } catch (e) {
    logError('dw lab failed', e);
    return internalError(c, `dw_lab_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Platform detail (per-platform event catalog) ───────────────────
detectionWikiRouter.get('/detection-wiki/platforms/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const detail = await mod.loadDwPlatformDetail(c.env.ASSETS, slug);
    if (!detail) return notFound(c, `Platform '${slug}' not found`);
    return c.json(detail);
  } catch (e) {
    logError('dw platform detail failed', e);
    return internalError(c, `dw_platform_detail_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Filters ──────────────────────────────────────────────────────────
detectionWikiRouter.get('/detection-wiki/filters', async (c) => {
  try {
    const mod = await loadMod();
    const filters = await mod.loadDwFilters(c.env.ASSETS);
    if (!filters) return notFound(c, 'Filters not found');
    return c.json(filters);
  } catch (e) {
    logError('dw filters failed', e);
    return internalError(c, `dw_filters_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── ATT&CK coverage ──────────────────────────────────────────────────
detectionWikiRouter.get('/detection-wiki/attack', async (c) => {
  try {
    const mod = await loadMod();
    const attack = await mod.loadDwAttackIndex(c.env.ASSETS);
    if (!attack) return notFound(c, 'Attack index not found');
    return c.json(attack);
  } catch (e) {
    logError('dw attack failed', e);
    return internalError(c, `dw_attack_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

detectionWikiRouter.get('/detection-wiki/attack/:id', async (c) => {
  try {
    const mod = await loadMod();
    const id = c.req.param('id');
    const body = await mod.getDwAttackTechnique(c.env.ASSETS, id);
    if (!body) return notFound(c, `Technique '${id}' not found`);
    return c.json(body);
  } catch (e) {
    logError('dw attack technique failed', e);
    return internalError(c, `dw_attack_technique_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Rules (sampled index) ────────────────────────────────────────────
detectionWikiRouter.get('/detection-wiki/rules', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadDwRules(c.env.ASSETS);
    if (!idx) return notFound(c, 'Rules index not found');
    const vendor = c.req.query('vendor') ?? undefined;
    const platform = c.req.query('platform') ?? undefined;
    const technique = c.req.query('technique') ?? undefined;
    const q = c.req.query('q') ?? undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 30;
    let rules = idx.rules;
    if (vendor) rules = rules.filter((r) => r.vendor.toLowerCase() === vendor.toLowerCase());
    if (platform) rules = rules.filter((r) => r.platform.toLowerCase() === platform.toLowerCase());
    if (technique) rules = rules.filter((r) => r.technique.toLowerCase() === technique.toLowerCase());
    if (q) {
      const needle = q.toLowerCase();
      rules = rules.filter((r) => `${r.title} ${r.technique} ${r.tactic} ${r.vendor}`.toLowerCase().includes(needle));
    }
    return c.json({
      totalRules: idx.totalRules,
      sampled: idx.sampledRules,
      returned: Math.min(rules.length, limit),
      rules: rules.slice(0, limit),
      note: idx.note,
    });
  } catch (e) {
    logError('dw rules failed', e);
    return internalError(c, `dw_rules_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ────────────────────────────────────────────────────────────
detectionWikiRouter.get('/detection-wiki/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadDwIndex(c.env.ASSETS);
    const windows = await mod.loadDwWindows(c.env.ASSETS);
    const sa = await mod.loadDwSecurityAuditing(c.env.ASSETS);
    return c.json({
      index: idx.stats,
      windows: windows
        ? {
            totalProviders: windows.totalProviders,
            sampled: windows.providers.length,
            totalEvents: windows.totalEvents,
          }
        : null,
      securityAuditing: sa
        ? { eventCount: sa.eventCount, sampleCount: sa.sampleCount, rulesCount: sa.rulesCount }
        : null,
      source: idx.source,
      cache: mod.dwCacheStats(),
    });
  } catch (e) {
    logError('dw stats failed', e);
    return internalError(c, `dw_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
