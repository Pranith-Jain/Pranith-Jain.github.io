import type { Context } from 'hono';
import type { Env } from '../env';
import { safeNullLog } from '../lib/safe-catch';

/**
 * Simple novelty detection — checks if a text/IOC/entity has been seen before
 * using a KV-backed bloom-like seen set (TTL 90 days).
 *
 * The case-study pipeline already writes to the dedup KV; this endpoint
 * surfaces the same data to the user-facing UI.
 */

const KV_PREFIX = 'novelty:v1';
const NOVELTY_CACHE_PREFIX = 'https://novelty-cache.internal/v1/';

function noveltyCacheApi(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch (_catchErr) {
    console.error('noveltyCacheApi failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return null;
  }
}

/**
 * Compute a stable hash for dedup text.
 */
function hash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h = (h << 5) - h + c;
    h |= 0; // convert to 32-bit int
  }
  return Math.abs(h).toString(36);
}

/**
 * Check if a piece of text has been seen before, and optionally mark it as seen.
 */
export async function checkNovelty(
  env: Env,
  text: string,
  markSeen = false
): Promise<{
  novel: boolean;
  score: number; // 0 (old) → 1 (completely new)
  first_seen: string | null;
}> {
  const kv = env.KV_CACHE;
  // No store bound → treat everything as novel (fail-open, don't crash).
  if (!kv) return { novel: true, score: 1.0, first_seen: null };
  const key = `${KV_PREFIX}:${hash(text)}`;
  // Check per-colo cache first — same hash queried repeatedly (e.g. UI polling)
  // avoids hitting KV every time.
  const cache = noveltyCacheApi();
  if (cache) {
    try {
      const r = await cache.match(new Request(NOVELTY_CACHE_PREFIX + hash(text)));
      if (r) {
        const { first_seen, score } = (await r.json()) as { first_seen: string; score: number };
        return { novel: false, score, first_seen };
      }
    } catch (_catchErr) {
      console.error('checkNovelty failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* fall through */
    }
  }
  const existing = await kv.get(key);

  if (existing) {
    // Decaying score: 3 days = 1.0, 30 days = 0.33, 90 days = 0.0
    const firstSeen = new Date(existing);
    const ageDays = (Date.now() - firstSeen.getTime()) / 86_400_000;
    const score = Math.max(0, 1 - ageDays / 90);
    const result = { novel: false, score: Math.round(score * 100) / 100, first_seen: existing };
    // Populate per-colo cache so repeated queries of the same hash skip KV
    if (cache) {
      safeNullLog(
        'cache-put-novelty',
        cache.put(
          new Request(NOVELTY_CACHE_PREFIX + hash(text)),
          new Response(JSON.stringify(result), { headers: { 'cache-control': 'max-age=60' } })
        )
      );
    }
    return result;
  }

  if (markSeen) {
    await kv.put(key, new Date().toISOString(), { expirationTtl: 7_776_000 }); // 90 days
  }

  return { novel: true, score: 1.0, first_seen: null };
}

/**
 * GET /api/v1/threat-intel/novelty
 * Query params:
 *   q  — text to check (required)
 *   mark — if "1", also record this text as seen (optional)
 */
export async function noveltyHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const text = c.req.query('q')?.trim();
    if (!text || text.length < 3) {
      return c.json({ error: 'q param required (min 3 chars)' }, 400);
    }
    const markSeen = c.req.query('mark') === '1';
    const result = await checkNovelty(c.env, text, markSeen);
    return c.json(result, 200, { 'Cache-Control': 'public, max-age=60' });
  } catch (e) {
    console.error('noveltyHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

/**
 * POST /api/v1/threat-intel/novelty/batch
 * Body: { texts: string[] }
 * Returns novelty status for each text and optionally marks them seen.
 */
export async function noveltyBatchHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json<{ texts: string[]; mark_seen?: boolean }>();
    if (!Array.isArray(body.texts) || body.texts.length === 0) {
      return c.json({ error: 'texts[] required' }, 400);
    }
    const results = await Promise.all(body.texts.map((t) => checkNovelty(c.env, t, body.mark_seen ?? false)));
    return c.json({ results });
  } catch (e) {
    console.error('noveltyBatchHandler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
