/**
 * Frameworks router — TID-CMM + UTIOM.
 *
 * Replicated static JSON from tid-cmm.com / utiom.de, served via env.ASSETS.
 * All data is public (CC-BY / CC BY-SA), no auth beyond the global API gate.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { internalError } from '../lib/api-error';
import { logError } from '../lib/logger';

async function loadFwMod() {
  return await import('../lib/frameworks-manifest');
}

export const frameworksRouter = new Hono<{ Bindings: Env }>();

frameworksRouter.get('/frameworks', async (c) => {
  try {
    const mod = await loadFwMod();
    const tid = await mod.loadTidCmmModel(c.env.ASSETS);
    const utiom = await mod.loadUtiomManifest(c.env.ASSETS);
    const stats = mod.frameworksCacheStats();
    return c.json({
      frameworks: [
        {
          id: 'tid-cmm',
          name: tid.model.name,
          version: tid.model.version,
          homepage: tid.model.homepage,
          licence: tid.model.licence,
          domains: tid.domains.length,
          subcapabilities: tid.domains.reduce((n: number, d: { subcapabilities: unknown[] }) => n + d.subcapabilities.length, 0),
        },
        {
          id: 'utiom',
          name: utiom.name,
          version: utiom.version,
          homepage: utiom.homepage,
          licence: utiom.licence,
          phases: utiom.phases.length,
          pillars: utiom.pillars.length,
        },
      ],
      cache: stats,
    });
  } catch (e) {
    logError('frameworks index failed', e);
    return internalError(c, `frameworks_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

frameworksRouter.get('/frameworks/tid-cmm', async (c) => {
  try {
    const mod = await loadFwMod();
    const model = await mod.loadTidCmmModel(c.env.ASSETS);
    const q = c.req.query('q') || undefined;
    const domains = q ? mod.filterTidDomains(model, q) : model.domains;
    return c.json({
      model: model.model,
      levels: model.levels,
      scoring: model.scoring,
      domains,
      filtered: q ? { q, matchedDomains: domains.length, totalDomains: model.domains.length } : undefined,
      cache: mod.frameworksCacheStats().tidCmm,
    });
  } catch (e) {
    logError('frameworks tid-cmm failed', e);
    return internalError(c, `tid_cmm_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

frameworksRouter.get('/frameworks/tid-cmm/domains/:id', async (c) => {
  const id = c.req.param('id').toUpperCase();
  try {
    const mod = await loadFwMod();
    const model = await mod.loadTidCmmModel(c.env.ASSETS);
    const domain = model.domains.find((d: { id: string }) => d.id === id);
    if (!domain) return c.json({ error: `domain_not_found: ${id}` }, 404);
    return c.json(domain);
  } catch (e) {
    logError('frameworks tid-cmm domain failed', e);
    return internalError(c, `tid_cmm_domain_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

frameworksRouter.get('/frameworks/utiom', async (c) => {
  try {
    const mod = await loadFwMod();
    const utiom = await mod.loadUtiomManifest(c.env.ASSETS);
    return c.json({ ...utiom, cache: mod.frameworksCacheStats().utiom });
  } catch (e) {
    logError('frameworks utiom failed', e);
    return internalError(c, `utiom_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

frameworksRouter.get('/frameworks/stats', async (c) => {
  try {
    const mod = await loadFwMod();
    // Touch both manifests so cache stats are warm
    await mod.loadTidCmmModel(c.env.ASSETS).catch(() => null);
    await mod.loadUtiomManifest(c.env.ASSETS).catch(() => null);
    return c.json(mod.frameworksCacheStats());
  } catch (e) {
    logError('frameworks stats failed', e);
    return internalError(c, `frameworks_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
