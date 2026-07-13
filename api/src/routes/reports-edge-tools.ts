import { Hono } from 'hono';
import type { Env } from '../env';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/reports-manifest');
}

export const reportsRouter = new Hono<{ Bindings: Env }>();

reportsRouter.get('/reports/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadReportsIndex(c.env.ASSETS);
    return c.json({
      total: idx.count,
      cache: mod.reportsCacheStats(),
    });
  } catch (e) {
    console.error('loadMod failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `reports_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

reportsRouter.get('/reports', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadReportsIndex(c.env.ASSETS);
    const category = c.req.query('category') as string | undefined;
    const keyword = c.req.query('q');
    const year = c.req.query('year') ? Number(c.req.query('year')) : undefined;
    const publisher = c.req.query('publisher');
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : undefined;
    const reports = mod.listReports(idx, { category: category as any, keyword, year, publisher, limit });
    return c.json({ count: reports.length, reports });
  } catch (e) {
    console.error('loadMod failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `reports_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

reportsRouter.get('/reports/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const idx = await mod.loadReportsIndex(c.env.ASSETS);
    const report = mod.getReport(idx, slug);
    if (!report) return notFound(c, `Report '${slug}' not found`);
    return c.json(report);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `reports_get_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
