/**
 * Threat Monitor — Global Threat Actor Monitor replication (hero-itsme).
 *
 * Endpoints (all under /api/v1/threat-monitor/):
 *   GET  /threat-monitor/                — slim index + upstream/expanded stats
 *   GET  /threat-monitor/groups          — list APT groups (q, origin, upstream_only, limit)
 *   GET  /threat-monitor/groups/:slug    — single group body
 *   GET  /threat-monitor/techniques      — list techniques (q, tactic, kill_chain, limit)
 *   GET  /threat-monitor/sources         — list OSINT sources (q, category, upstream_only, limit)
 *   GET  /threat-monitor/proxy?url=      — RSS proxy (avoids CORS)
 *   GET  /threat-monitor/config          — legacy config (proxyUrl + counts)
 *   GET  /threat-monitor/stats           — cache + manifest stats
 *
 * Source: https://github.com/hero-itsme/Global-Threat-Actor-Monitor (MIT)
 * Data ships in public/data/threat-monitor/ via ASSETS.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/threat-monitor-manifest');
}

export const threatMonitorRouter = new Hono<{ Bindings: Env }>();

// Proxy RSS feed fetch (avoids CORS in browser)
threatMonitorRouter.get('/threat-monitor/proxy', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url required' }, 400);
  try {
    const u = new URL(url);
    if (!u.protocol.startsWith('http')) return c.json({ error: 'invalid protocol' }, 400);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GlobalThreatActorMonitor/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    return new Response(await res.text(), {
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'application/xml',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ─── Slim index ───────────────────────────────────────────────────────
threatMonitorRouter.get('/threat-monitor/', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadTamIndex(c.env.ASSETS);
    return c.json(idx);
  } catch (e) {
    logError('tam index failed', e);
    return internalError(c, `tam_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Groups ─────────────────────────────────────────────────────────
threatMonitorRouter.get('/threat-monitor/groups', async (c) => {
  try {
    const mod = await loadMod();
    const file = await mod.loadTamGroups(c.env.ASSETS);
    const q = c.req.query('q') ?? undefined;
    const origin = c.req.query('origin') ?? undefined;
    const upstreamOnly = c.req.query('upstream_only') === 'true';
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
    const filtered = mod.filterTamGroups(file.groups, { q, origin, upstreamOnly, limit });
    return c.json({
      total: file.totalGroups,
      upstream: file.upstreamGroups,
      expanded: file.expandedGroups,
      returned: filtered.length,
      groups: filtered,
    });
  } catch (e) {
    logError('tam groups failed', e);
    return internalError(c, `tam_groups_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

threatMonitorRouter.get('/threat-monitor/groups/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const body = await mod.getTamGroup(c.env.ASSETS, slug);
    if (!body) return notFound(c, `Group '${slug}' not found`);
    return c.json(body);
  } catch (e) {
    logError('tam group failed', e);
    return internalError(c, `tam_group_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Techniques ─────────────────────────────────────────────────────
threatMonitorRouter.get('/threat-monitor/techniques', async (c) => {
  try {
    const mod = await loadMod();
    const file = await mod.loadTamTechniques(c.env.ASSETS);
    const q = c.req.query('q') ?? undefined;
    const tactic = c.req.query('tactic') ?? undefined;
    const kill_chain = c.req.query('kill_chain') ?? undefined;
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
    const filtered = mod.filterTamTechniques(file.techniques, { q, tactic, kill_chain, limit });
    return c.json({
      total: file.totalTechniques,
      upstream: file.upstreamTechniques,
      expanded: file.expandedTechniques,
      returned: filtered.length,
      techniques: filtered,
      killChainStages: file.killChainStages,
    });
  } catch (e) {
    logError('tam techniques failed', e);
    return internalError(c, `tam_techniques_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Sources ────────────────────────────────────────────────────────
threatMonitorRouter.get('/threat-monitor/sources', async (c) => {
  try {
    const mod = await loadMod();
    const file = await mod.loadTamSources(c.env.ASSETS);
    const q = c.req.query('q') ?? undefined;
    const category = c.req.query('category') ?? undefined;
    const upstreamOnly = c.req.query('upstream_only') === 'true';
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 50;
    const filtered = mod.filterTamSources(file.sources, { q, category, upstreamOnly, limit });
    return c.json({
      total: file.totalSources,
      upstream: file.upstreamSources,
      expanded: file.expandedSources,
      categories: file.categories,
      returned: filtered.length,
      sources: filtered,
    });
  } catch (e) {
    logError('tam sources failed', e);
    return internalError(c, `tam_sources_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ──────────────────────────────────────────────────────────
threatMonitorRouter.get('/threat-monitor/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadTamIndex(c.env.ASSETS);
    return c.json({
      stats: idx.stats,
      upstream: idx.upstream,
      expanded: idx.expanded,
      source: idx.source,
      cache: mod.tamCacheStats(),
    });
  } catch (e) {
    logError('tam stats failed', e);
    return internalError(c, `tam_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// Config endpoint (legacy)
threatMonitorRouter.get('/threat-monitor/config', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadTamIndex(c.env.ASSETS).catch(() => null);
    return c.json({
      proxyUrl: '/api/v1/threat-monitor/proxy',
      aptGroups: idx?.expanded.groups ?? 40,
      upstreamGroups: idx?.upstream.groups ?? 40,
      techniques: idx?.expanded.techniques ?? 29,
      upstreamTechniques: idx?.upstream.techniques ?? 29,
      killChainStages: idx?.stats.killChainStages ?? 7,
      osintFeeds: idx?.expanded.sources ?? 30,
      upstreamFeeds: idx?.upstream.sources ?? 30,
    });
  } catch {
    return c.json({
      proxyUrl: '/api/v1/threat-monitor/proxy',
      aptGroups: 40,
      techniques: 29,
      killChainStages: 7,
      osintFeeds: 30,
    });
  }
});
