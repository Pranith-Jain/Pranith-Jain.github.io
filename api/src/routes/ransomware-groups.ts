/**
 * Ransomware Groups directory — REST surface for the Sinon-style /ransomware reference.
 *
 * All read-only, served from the static ASSETS manifest (no per-request
 * upstream, no Tor egress):
 *   GET  /ransomware-groups/            — headline counts + recent slugs
 *   GET  /ransomware-groups/groups      — directory rows (q, status, active_week,
 *                                          has_profile, sort, limit)
 *   GET  /ransomware-groups/groups/:slug — full group body (mirrors, victim sample)
 *   GET  /ransomware-groups/stats       — cache + manifest stats
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/ransomware-groups-manifest');
}

export const ransomwareGroupsRouter = new Hono<{ Bindings: Env }>();

ransomwareGroupsRouter.get('/ransomware-groups/', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadRansomwareGroupsIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      sourceUrl: idx.sourceUrl,
      license: idx.license,
      syncedAt: idx.syncedAt,
      builtAt: idx.builtAt,
      counts: idx.counts,
      recent: idx.recent,
    });
  } catch (e) {
    logError('ransomware-groups index failed', e);
    return internalError(c, `ransomware_groups_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

ransomwareGroupsRouter.get('/ransomware-groups/groups', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadRansomwareGroupsIndex(c.env.ASSETS);
    const status = c.req.query('status');
    const sortParam = c.req.query('sort');
    const entries = mod.filterRansomwareGroups(idx, {
      q: c.req.query('q') || undefined,
      status: status === 'online' || status === 'offline' || status === 'unknown' ? status : undefined,
      activeWeek: c.req.query('active_week') === 'true',
      hasProfile: c.req.query('has_profile') === 'true',
      sort: sortParam === 'name' || sortParam === 'victims' ? sortParam : 'recent',
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : 100,
    });
    return c.json({ total: idx.counts.groups, returned: entries.length, groups: entries });
  } catch (e) {
    logError('ransomware-groups list failed', e);
    return internalError(c, `ransomware_groups_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

ransomwareGroupsRouter.get('/ransomware-groups/groups/:slug', async (c) => {
  const slug = c.req.param('slug').toLowerCase();
  try {
    const mod = await loadMod();
    const body = await mod.getRansomwareGroup(c.env.ASSETS, slug);
    if (!body) return notFound(c, `ransomware_group_not_found: ${slug}`);
    return c.json(body);
  } catch (e) {
    logError('ransomware-group body failed', e);
    return internalError(c, `ransomware_group_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

ransomwareGroupsRouter.get('/ransomware-groups/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadRansomwareGroupsIndex(c.env.ASSETS);
    return c.json({ counts: idx.counts, cache: mod.ransomwareGroupsCacheStats() });
  } catch (e) {
    logError('ransomware-groups stats failed', e);
    return internalError(c, `ransomware_groups_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
