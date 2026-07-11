import { Hono } from 'hono';
import type { Env } from '../env';

const CACHE_TTL = 86400;

export const dehashRouter = new Hono<{ Bindings: Env }>();

type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512';

function detectHashType(hash: string): HashAlgorithm | null {
  const len = hash.length;
  if (len === 32 && /^[a-f0-9]{32}$/i.test(hash)) return 'md5';
  if (len === 40 && /^[a-f0-9]{40}$/i.test(hash)) return 'sha1';
  if (len === 64 && /^[a-f0-9]{64}$/i.test(hash)) return 'sha256';
  if (len === 96 && /^[a-f0-9]{96}$/i.test(hash)) return 'sha384';
  if (len === 128 && /^[a-f0-9]{128}$/i.test(hash)) return 'sha512';
  return null;
}

dehashRouter.get('/dehash', async (c) => {
  const hash = c.req.query('hash');
  if (!hash) return c.json({ error: 'hash parameter required' }, 400);

  const hashType = detectHashType(hash);
  if (!hashType) {
    return c.json({ error: 'unsupported hash type — must be md5/sha1/sha256/sha384/sha512 hex string' }, 400);
  }

  const cacheKey = `dehash:${hash}`;
  const cached = await c.env.KV_CACHE?.get(cacheKey, 'json');
  if (cached) return c.json({ ...(cached as object), cached: true });

  try {
    const url = `https://api.dehash.lt/api/v1/lookup?hash=${encodeURIComponent(hash)}&type=${hashType}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 404) {
      const body = { hash, found: false, hash_type: hashType, generated_at: new Date().toISOString(), cached: false };
      if (c.env.KV_CACHE) {
        c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_TTL }));
      }
      return c.json(body);
    }
    if (!res.ok) return c.json({ error: `Dehash.lt upstream ${res.status}` }, 502);

    const data = await res.json();
    const body = {
      hash,
      found: true,
      hash_type: hashType,
      result: data,
      generated_at: new Date().toISOString(),
      cached: false,
    };

    if (c.env.KV_CACHE) {
      c.executionCtx.waitUntil(c.env.KV_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_TTL }));
    }
    return c.json(body);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'Dehash.lt unreachable' }, 502);
  }
});
