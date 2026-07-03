import { Hono } from 'hono';
import type { Env } from '../env';
import { internalError, notFound } from '../lib/api-error';

export const tiDashboardRouter = new Hono<{ Bindings: Env }>();

tiDashboardRouter.get('/ti-dashboard/', async (c) => {
  try {
    const mod = await import('../lib/ti-dashboard/build');
    const db = c.env.BRIEFINGS_DB;
    if (!db) return internalError(c, 'no_db');
    const report = await mod.readDashboard(db as any, undefined);
    if (!report) return notFound(c, 'no_dashboard_found');
    return c.json(report);
  } catch (e) {
    return internalError(c, `dashboard_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

tiDashboardRouter.get('/ti-dashboard/:slug', async (c) => {
  const slug = c.req.param('slug');
  try {
    const mod = await import('../lib/ti-dashboard/build');
    const db = c.env.BRIEFINGS_DB;
    if (!db) return internalError(c, 'no_db');
    const report = await mod.readDashboard(db as any, slug);
    if (!report) return notFound(c, `dashboard_not_found: ${slug}`);
    return c.json(report);
  } catch (e) {
    return internalError(c, `dashboard_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

tiDashboardRouter.post('/ti-dashboard/build', async (c) => {
  try {
    const mod = await import('../lib/ti-dashboard/build');
    const db = c.env.BRIEFINGS_DB;
    if (!db) return internalError(c, 'no_db');
    const report = await mod.buildWeeklyDashboard(c.env);
    await mod.persistDashboard(db as any, report);
    return c.json({ ok: true, slug: report.slug, sources: report.metadata.documents_analyzed });
  } catch (e) {
    return internalError(c, `dashboard_build_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

tiDashboardRouter.get('/ti-dashboard/sources/articles', async (c) => {
  try {
    const mod = await import('../lib/ti-dashboard/feeds');
    const db = c.env.BRIEFINGS_DB;
    if (!db) return internalError(c, 'no_db');
    const articles = await mod.fetchRecentArticles(db as any, 100);
    return c.json({ articles });
  } catch (e) {
    return internalError(c, `articles_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

tiDashboardRouter.get('/ti-dashboard/sources/supply-chain', async (c) => {
  try {
    const mod = await import('../lib/ti-dashboard/feeds');
    const db = c.env.BRIEFINGS_DB;
    if (!db) return internalError(c, 'no_db');
    const incidents = await mod.fetchRecentSupplyChainIncidents(db as any, 50);
    return c.json({ incidents });
  } catch (e) {
    return internalError(c, `supply_chain_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
