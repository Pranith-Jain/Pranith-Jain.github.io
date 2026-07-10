/**
 * APT Actors edge tools — REST surface for ETDA Threat Group Cards data.
 *
 * Endpoints (all under /api/v1/apt-actors/):
 *   GET  /apt-actors/                — slim index
 *   GET  /apt-actors/actors          — list actors with filters (category, country, etc.)
 *   GET  /apt-actors/actors/:slug    — full actor body
 *   GET  /apt-actors/sectors         — list target sectors with actor counts
 *   GET  /apt-actors/aptmap          — APTmap relationship graph
 *   GET  /apt-actors/stats           — cache + manifest stats
 *
 * The actual logic lives in worker/lib/etda-actors-manifest.ts (symlinked).
 * Routes read from env.ASSETS — no D1, no KV, no public fetch.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { internalError, notFound } from '../lib/api-error';
import * as mod from '../lib/etda-actors-manifest';

export const etdaActorsRouter = new Hono<{ Bindings: Env }>();

// ─── Slim index ────────────────────────────────────────────────────────
etdaActorsRouter.get('/apt-actors/', async (c) => {
  try {
    const idx = await mod.loadActorIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      lastSyncedAt: idx.lastSyncedAt,
      counts: idx.counts,
      aptmap: idx.aptmap,
    });
  } catch (e) {
    return internalError(c, `actors_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List actors ───────────────────────────────────────────────────────
etdaActorsRouter.get('/apt-actors/actors', async (c) => {
  try {
    const idx = await mod.loadActorIndex(c.env.ASSETS);
    const category = c.req.query('category');
    const country = c.req.query('country');
    const hasMitre = c.req.query('has_mitre') === 'true' ? true : undefined;
    const hasTools = c.req.query('has_tools') === 'true' ? true : undefined;
    const keyword = c.req.query('q');
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : undefined;

    const actors = mod.filterActors(idx, {
      category: category as any,
      country: country || undefined,
      hasMitre,
      hasTools,
      keyword: keyword || undefined,
      limit,
    });
    return c.json({ total: idx.counts.actors, returned: actors.length, actors });
  } catch (e) {
    return internalError(c, `actors_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single actor ──────────────────────────────────────────────────────
etdaActorsRouter.get('/apt-actors/actors/:slug', async (c) => {
  const slug = c.req.param('slug');
  try {
    const body = await mod.getActor(c.env.ASSETS, slug);
    if (!body) return notFound(c, `actor_not_found: ${slug}`);
    return c.json(body);
  } catch (e) {
    return internalError(c, `actor_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Sectors ──────────────────────────────────────────────────────────
etdaActorsRouter.get('/apt-actors/sectors', async (c) => {
  try {
    const idx = await mod.loadActorIndex(c.env.ASSETS);
    const minActors = c.req.query('min_actors') ? Math.max(1, Number(c.req.query('min_actors'))) : 1;

    const sectorMap = new Map<string, number>();
    for (const a of idx.actorIndex) {
      if (a.sectorCount === 0) continue;
      const body = await mod.getActor(c.env.ASSETS, a.slug);
      if (!body) continue;
      for (const s of body.sectors) {
        sectorMap.set(s, (sectorMap.get(s) || 0) + 1);
      }
    }
    const sectors = [...sectorMap.entries()]
      .filter(([, count]) => count >= minActors)
      .sort(([, a], [, b]) => b - a)
      .map(([sector, count]) => ({ sector, actorCount: count }));

    return c.json({ total: sectors.length, minActors, sectors });
  } catch (e) {
    return internalError(c, `actors_sectors_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── APTmap graph ────────────────────────────────────────────────────
etdaActorsRouter.get('/apt-actors/aptmap', async (c) => {
  try {
    const graph = await mod.loadAptmap(c.env.ASSETS);
    if (!graph) return notFound(c, 'aptmap_not_found: APTmap graph not available');
    return c.json({
      nodes: graph.nodes?.length ?? 0,
      links: graph.links?.length ?? 0,
      graph,
    });
  } catch (e) {
    return internalError(c, `aptmap_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── APTmap data files ──────────────────────────────────────────────
etdaActorsRouter.get('/apt-actors/aptmap/data', async (c) => {
  try {
    const idx = await mod.loadActorIndex(c.env.ASSETS);
    const files = mod.listAptmapDataFiles(idx);
    return c.json({ total: files.length, files });
  } catch (e) {
    return internalError(c, `aptmap_data_list_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

etdaActorsRouter.get('/apt-actors/aptmap/data/:filename', async (c) => {
  const filename = c.req.param('filename');
  if (!filename.endsWith('.json')) return notFound(c, 'aptmap_data_not_found: only .json files are supported');
  try {
    const data = await mod.loadAptmapDataFile(c.env.ASSETS, filename);
    if (!data) return notFound(c, `aptmap_data_not_found: ${filename} not available`);
    return c.json(data);
  } catch (e) {
    return internalError(c, `aptmap_data_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ────────────────────────────────────────────────────────────
etdaActorsRouter.get('/apt-actors/stats', async (c) => {
  try {
    const idx = await mod.loadActorIndex(c.env.ASSETS);
    const cache = mod.actorsCacheStats();
    return c.json({
      counts: idx.counts,
      source: idx.source,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      lastSyncedAt: idx.lastSyncedAt,
      aptmap: idx.aptmap,
      cache,
    });
  } catch (e) {
    return internalError(c, `actors_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
