import type { Context } from 'hono';
import type { Env } from '../env';

const MALPEDIA_BASE = 'https://malpedia.caad.fkie.fraunhofer.de';

export async function malpediaActorHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const name = c.req.query('q');
  if (!name || !name.trim()) {
    return c.json({ error: 'missing query param q' }, 400, { 'cache-control': 'no-store' });
  }

  const actorSlug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-');
  try {
    const res = await fetch(`${MALPEDIA_BASE}/api/get/actor/${encodeURIComponent(actorSlug)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) {
      return c.json({ ok: false, error: 'actor not found' }, 404, { 'cache-control': 'public, max-age=3600' });
    }
    if (!res.ok) {
      return c.json({ error: `malpedia: ${res.status}` }, 502, { 'cache-control': 'no-store' });
    }
    const data = await res.json();
    return c.json({ ok: true, data }, 200, { 'cache-control': 'public, max-age=3600' });
  } catch (err) {
    console.error('malpediaActorHandler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502, {
      'cache-control': 'no-store',
    });
  }
}

export async function malpediaFamilyHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const name = c.req.query('q');
  if (!name || !name.trim()) {
    return c.json({ error: 'missing query param q' }, 400, { 'cache-control': 'no-store' });
  }

  const familySlug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-');
  try {
    const res = await fetch(`${MALPEDIA_BASE}/api/get/family/${encodeURIComponent(familySlug)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) {
      return c.json({ ok: false, error: 'family not found' }, 404, { 'cache-control': 'public, max-age=3600' });
    }
    if (!res.ok) {
      return c.json({ error: `malpedia: ${res.status}` }, 502, { 'cache-control': 'no-store' });
    }
    const data = await res.json();
    return c.json({ ok: true, data }, 200, { 'cache-control': 'public, max-age=3600' });
  } catch (err) {
    console.error('malpediaFamilyHandler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502, {
      'cache-control': 'no-store',
    });
  }
}

export async function malpediaSearchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query('q');
  if (!q || !q.trim()) {
    return c.json({ error: 'missing query param q' }, 400, { 'cache-control': 'no-store' });
  }

  const query = q.trim().toLowerCase();
  // Each endpoint is fetched + parsed independently. Previously Promise.all
  // would reject if the network threw on either fetch, killing both halves
  // even though Malpedia's families/actors data are independent.
  const fetchJson = async (path: string): Promise<unknown> => {
    try {
      const res = await fetch(`${MALPEDIA_BASE}${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return [];
      return await res.json();
    } catch (_catchErr) {
      console.error(
        'malpediaSearchHandler failed:',
        _catchErr instanceof Error ? _catchErr.message : String(_catchErr)
      );
      return [];
    }
  };
  try {
    const [families, actors] = await Promise.all([fetchJson('/api/get/families'), fetchJson('/api/get/actors')]);

    const familyResults = (Array.isArray(families) ? families : [])
      .filter((f: unknown) => {
        if (typeof f !== 'object' || f === null) return false;
        const rec = f as Record<string, unknown>;
        const nameStr = String(rec.family_name ?? rec.common_name ?? '');
        return nameStr.toLowerCase().includes(query);
      })
      .slice(0, 20);

    const actorResults = (Array.isArray(actors) ? actors : [])
      .filter((a: unknown) => {
        if (typeof a !== 'object' || a === null) return false;
        const rec = a as Record<string, unknown>;
        const nameStr = String(rec.actor_name ?? '');
        return nameStr.toLowerCase().includes(query);
      })
      .slice(0, 20);

    return c.json({ ok: true, families: familyResults, actors: actorResults }, 200, {
      'cache-control': 'public, max-age=3600',
    });
  } catch (err) {
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502, {
      'cache-control': 'no-store',
    });
  }
}
