import { Hono } from 'hono';
import type { Env } from '../env';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/tools-manifest');
}

export const toolsRouter = new Hono<{ Bindings: Env }>();

toolsRouter.get('/tools/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadToolsIndex(c.env.ASSETS);
    const cache = mod.toolsCacheStats();
    return c.json({
      count: idx.length,
      categories: [...new Set(idx.map((t: { category: string }) => t.category))].sort(),
      cache,
    });
  } catch (e) {
    return internalError(c, `tools_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

toolsRouter.get('/tools', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadToolsIndex(c.env.ASSETS);
    const category = c.req.query('category') as string | undefined;
    const keyword = c.req.query('q');
    const offensive = c.req.query('offensive') === 'true' ? true : c.req.query('offensive') === 'false' ? false : undefined;
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : undefined;
    const results = mod.listTools(idx, { category: category as any, keyword, offensive, limit });
    return c.json({ count: results.length, tools: results });
  } catch (e) {
    return internalError(c, `tools_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

toolsRouter.get('/tools/:slug', async (c) => {
  try {
    const mod = await loadMod();
    const slug = c.req.param('slug');
    const body = await mod.getTool(c.env.ASSETS, slug);
    if (!body) return notFound(c, `tool_not_found: ${slug}`);
    return c.json(body);
  } catch (e) {
    return internalError(c, `tool_detail_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
