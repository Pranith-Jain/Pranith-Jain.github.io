import { Hono } from 'hono';
import type { Env } from '../env';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/campaigns-manifest');
}

export const campaignsRouter = new Hono<{ Bindings: Env }>();

campaignsRouter.get('/campaigns-catalog/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadCampaignsIndex(c.env.ASSETS);
    return c.json({
      total: idx.count,
      source: idx.source,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      cache: mod.campaignsCacheStats(),
    });
  } catch (e) {
    return internalError(c, `campaigns_catalog_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

campaignsRouter.get('/campaigns-catalog', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadCampaignsIndex(c.env.ASSETS);
    const status = c.req.query('status') as string | undefined;
    const category = c.req.query('category') as string | undefined;
    const keyword = c.req.query('q');
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : undefined;
    const campaigns = mod.listCampaigns(idx, {
      status: status as any,
      category: category as any,
      keyword,
      limit,
    });
    return c.json({ count: campaigns.length, campaigns });
  } catch (e) {
    return internalError(c, `campaigns_catalog_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

campaignsRouter.get('/campaigns-catalog/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const idx = await mod.loadCampaignsIndex(c.env.ASSETS);
    const campaign = mod.getCampaign(idx, slug);
    if (!campaign) return notFound(c, `Campaign '${slug}' not found`);
    return c.json(campaign);
  } catch (e) {
    return internalError(c, `campaigns_catalog_get_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
