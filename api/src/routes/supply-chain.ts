// api/src/routes/supply-chain.ts
// Thin HTTP handlers for the supply-chain intelligence module. Caching lives
// HERE (KV), never in the lib fns. See design §8.3.
import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchDepsDev } from '../lib/supply-chain/depsdev';

const DEPSDEV_TTL = 21600; // 6h (spec §8.3)
const DEPSDEV_NEG_TTL = 3600; // 1h negative cache for empty/404

export async function depsDevPackageHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const system = (c.req.query('system') ?? '').trim().toLowerCase();
  const name = (c.req.query('name') ?? '').trim();
  const version = c.req.query('version')?.trim() || undefined;
  if (!system || !name) return c.json({ error: 'missing system or name' }, 400);

  const kv = c.env.KV_CACHE;
  const key = `sc:depsdev:${system}:${name}:${version ?? '*'}`;
  if (kv) {
    const cached = await kv.get(key, 'json');
    if (cached) return c.json(cached, 200, { 'Cache-Control': 'public, max-age=1800' });
  }

  try {
    const result = await fetchDepsDev(system, name, version, { signal: AbortSignal.timeout(9000) });
    if (kv && (result.status === 'ok' || result.status === 'empty')) {
      const ttl = result.status === 'empty' ? DEPSDEV_NEG_TTL : DEPSDEV_TTL;
      c.executionCtx.waitUntil(kv.put(key, JSON.stringify(result), { expirationTtl: ttl }));
    }
    return c.json(result, 200, { 'Cache-Control': 'public, max-age=1800' });
  } catch (err) {
    console.error('depsDevPackageHandler failed:', err instanceof Error ? err.message : String(err));
    return c.json(
      { error: 'deps.dev lookup failed', message: err instanceof Error ? err.message : 'Unknown error' },
      502,
      { 'Cache-Control': 'no-store' }
    );
  }
}
