/**
 * Anarchy (kazamadono.github.io) — REST surface for the replicated course catalog.
 *
 * All read-only, served from static ASSETS manifest (no upstream per-request):
 *   GET /anarchy/              — headline counts + categories + topTags
 *   GET /anarchy/courses       — courses (q, tag, limit)
 *   GET /anarchy/courses/:id   — full course body
 *   GET /anarchy/tags          — tag counts
 *   GET /anarchy/tags/:tag     — courses by tag
 *   GET /anarchy/recommend     — ranked picks for a library (?saved=&done=&doing=&maxHours=&limit=)
 *   GET /anarchy/similar/:id   — courses similar to one course
 *   GET /anarchy/stats         — cache + manifest stats
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { internalError, notFound } from '../lib/api-error';

async function loadMod() {
  return await import('../lib/anarchy-manifest');
}

export const anarchyRouter = new Hono<{ Bindings: Env }>();

anarchyRouter.get('/anarchy/', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadAnarchyIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      url: idx.url,
      coursesUrl: idx.coursesUrl,
      description: idx.description,
      license: idx.license,
      author: idx.author,
      authorUrl: idx.authorUrl,
      syncedAt: idx.syncedAt,
      builtAt: idx.builtAt,
      counts: idx.counts,
      categories: idx.categories,
      topTags: idx.topTags,
      topProviders: (idx as unknown as { topProviders?: unknown }).topProviders ?? [],
      prereqGraph: (idx as unknown as { prereqGraph?: unknown }).prereqGraph ?? {},
    });
  } catch (e) {
    logError('anarchy index failed', e);
    return internalError(c, `anarchy_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

anarchyRouter.get('/anarchy/courses', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadAnarchyIndex(c.env.ASSETS);
    const entries = mod.filterAnarchyCourses(idx, {
      tag: c.req.query('tag') || undefined,
      q: c.req.query('q') || undefined,
      difficulty: c.req.query('difficulty') as never,
      provider: c.req.query('provider') || undefined,
      maxHours: c.req.query('maxHours') ? Number(c.req.query('maxHours')) : undefined,
      sort: c.req.query('sort') as never,
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : 100,
    });
    return c.json({ total: idx.counts.courses, returned: entries.length, courses: entries });
  } catch (e) {
    logError('anarchy courses failed', e);
    return internalError(c, `anarchy_courses_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

anarchyRouter.get('/anarchy/courses/:id', async (c) => {
  const id = c.req.param('id').toLowerCase();
  try {
    const mod = await loadMod();
    const body = await mod.getAnarchyCourse(c.env.ASSETS, id);
    if (!body) return notFound(c, `anarchy_course_not_found: ${id}`);
    return c.json(body);
  } catch (e) {
    logError('anarchy course failed', e);
    return internalError(c, `anarchy_course_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

anarchyRouter.get('/anarchy/tags', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadAnarchyIndex(c.env.ASSETS);
    return c.json({ categories: idx.categories, topTags: idx.topTags });
  } catch (e) {
    logError('anarchy tags failed', e);
    return internalError(c, `anarchy_tags_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

anarchyRouter.get('/anarchy/tags/:tag', async (c) => {
  const tag = c.req.param('tag').toLowerCase();
  try {
    const mod = await loadMod();
    const body = await mod.getAnarchyTag(c.env.ASSETS, tag);
    if (!body) return notFound(c, `anarchy_tag_not_found: ${tag}`);
    return c.json(body);
  } catch (e) {
    logError('anarchy tag failed', e);
    return internalError(c, `anarchy_tag_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

function csvParam(c: { req: { query: (k: string) => string | undefined } }, key: string): string[] | undefined {
  const raw = c.req.query(key);
  if (!raw) return undefined;
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

anarchyRouter.get('/anarchy/recommend', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadAnarchyIndex(c.env.ASSETS);
    const recs = mod.recommendAnarchyCourses(idx, {
      saved: csvParam(c, 'saved'),
      done: csvParam(c, 'done'),
      doing: csvParam(c, 'doing'),
      maxHours: c.req.query('maxHours') ? Number(c.req.query('maxHours')) : undefined,
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : 12,
    });
    return c.json({
      total: idx.counts.courses,
      returned: recs.length,
      recommendations: recs.map((r) => ({ ...r.course, score: r.score, reasons: r.reasons })),
    });
  } catch (e) {
    logError('anarchy recommend failed', e);
    return internalError(c, `anarchy_recommend_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

anarchyRouter.get('/anarchy/similar/:id', async (c) => {
  const id = c.req.param('id').toLowerCase();
  try {
    const mod = await loadMod();
    const idx = await mod.loadAnarchyIndex(c.env.ASSETS);
    const sims = mod.similarAnarchyCourses(idx, id, c.req.query('limit') ? Number(c.req.query('limit')) : 4);
    return c.json({
      id,
      returned: sims.length,
      similar: sims.map((r) => ({ ...r.course, score: r.score, reasons: r.reasons })),
    });
  } catch (e) {
    logError('anarchy similar failed', e);
    return internalError(c, `anarchy_similar_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

anarchyRouter.get('/anarchy/stats', async (c) => {
  try {
    const mod = await loadMod();
    const idx = await mod.loadAnarchyIndex(c.env.ASSETS);
    return c.json({ counts: idx.counts, syncedAt: idx.syncedAt, builtAt: idx.builtAt, cache: mod.anarchyCacheStats() });
  } catch (e) {
    logError('anarchy stats failed', e);
    return internalError(c, `anarchy_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
