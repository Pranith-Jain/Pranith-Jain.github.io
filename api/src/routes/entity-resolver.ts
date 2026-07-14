import type { Context } from 'hono';
import type { Env } from '../env';
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
  if (!q) return c.json({ error: 'missing query param q' }, 400);

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
      return c.json({ error: 'text body field required' }, 400);
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
    console.error('entityExtractHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * POST /api/v1/threat-intel/entities/profile — bulk profile resolution
 */
export async function entityProfileHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = (await c.req.json()) as { ids?: string[] };
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return c.json({ error: 'ids array required' }, 400);
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
        console.error(
          'entityProfileHandler failed:',
          _catchErr instanceof Error ? _catchErr.message : String(_catchErr)
        );
        results.push({ query: id, error: 'resolution_failed' });
      }
    }
    return c.json({
      resolved: results.filter((r) => r.entity).length,
      failed: results.filter((r) => r.error).length,
      results,
    });
  } catch (e) {
    console.error('entityProfileHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
