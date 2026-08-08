import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError } from '../lib/api-error';
import {
  resolveEntity,
  extractEntities,
  buildEntityProfile,
  type ResolvedEntity,
  type EntityProfile,
} from '../lib/entity-resolution';

/**
 * GET /api/v1/threat-intel/entities/resolve — resolve a single entity query
 */
export async function entityResolveHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query('q')?.trim();
  if (!q) return badRequest(c, 'missing query param q');

  const full = c.req.query('full') === 'true';
  const entity = resolveEntity(q);
  if (!entity) return c.json({ resolved: false, query: q }, 200);

  if (full) {
    const profile = await buildEntityProfile(entity);
    return c.json({ resolved: true, query: q, ...profile }, 200, {
      'Cache-Control': 'public, max-age=300',
    });
  }

  return c.json({ resolved: true, query: q, entity }, 200, {
    'Cache-Control': 'public, max-age=600',
  });
}

/**
 * POST /api/v1/threat-intel/entities/extract — extract entities from text
 */
export async function entityExtractHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = (await c.req.json()) as { text?: string };
    if (!body.text || !body.text.trim()) {
      return badRequest(c, 'text body field required');
    }
    const entities = extractEntities(body.text);
    return c.json(
      {
        text_length: body.text.length,
        entities_found: entities.length,
        entities,
      },
      200,
      { 'Cache-Control': 'public, max-age=60' }
    );
  } catch (e) {
    logError('entityExtractHandler failed', e);
    return internalError(c, e instanceof Error ? e.message : String(e));
  }
}

/**
 * POST /api/v1/threat-intel/entities/profile — bulk profile resolution
 */
export async function entityProfileHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = (await c.req.json()) as { ids?: string[] };
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return badRequest(c, 'ids array required');
    }
    const results: Array<{ query: string; entity?: ResolvedEntity; profile?: EntityProfile; error?: string }> = [];
    for (const id of body.ids.slice(0, 20)) {
      try {
        const entity = resolveEntity(id);
        if (!entity) {
          results.push({ query: id, error: 'unresolved' });
          continue;
        }
        const profile = await buildEntityProfile(entity);
        results.push({ query: id, entity, profile });
      } catch (_catchErr) {
        logError('entityProfileHandler failed', _catchErr);
        results.push({ query: id, error: 'resolution_failed' });
      }
    }
    return c.json({
      resolved: results.filter((r) => r.entity).length,
      failed: results.filter((r) => r.error).length,
      results,
    });
  } catch (e) {
    logError('entityProfileHandler failed', e);
    return internalError(c, e instanceof Error ? e.message : String(e));
  }
}
