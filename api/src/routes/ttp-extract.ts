/**
 * /api/v1/ttp-extract — extract MITRE ATT&CK techniques from a free-text
 * report or paste. Combines a deterministic keyword scanner with an LLM
 * pass; returns the union of both, deduped by technique id, scored by
 * confidence (high/medium/low).
 *
 * POST body: { text: string, useLlm?: boolean }
 *   - useLlm: default true. When false, only the keyword scanner runs
 *     (cheap, ~1ms, useful for unit tests and very long inputs).
 *
 * Response: { techniques, model, source, error? }
 *
 * The 5-minute Cache API entry covers repeated page loads / re-renders
 * for the same report text.
 */
import type { Context } from 'hono';
import type { Env } from '../env';
import { extractTTPsKeyword, extractTTPsLLM, type TtpHit } from '../lib/ttp-extract';
import { safeNullLog } from '../lib/safe-catch';

const CACHE_TTL = 300; // 5 minutes

function cacheKey(text: string, useLlm: boolean): Request {
  // Hash-ish: just use the first 64 chars + length. Good enough for
  // per-report dedup; collisions are tolerable (worst case: stale
  // techniques served for a different report with the same prefix).
  const k = `${useLlm ? '1' : '0'}:${text.length}:${text.slice(0, 64)}`;
  return new Request(`https://ttp-extract.internal/v1/${encodeURIComponent(k)}`);
}

export async function ttpExtractHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: { text?: string; useLlm?: boolean };
  try {
    body = await c.req.json();
  } catch (_catchErr) {
    console.error('ttpExtractHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
  }
  const text = typeof body.text === 'string' ? body.text : '';
  if (text.trim().length < 30) {
    return c.json({ error: 'bad_request', message: 'text must be at least 30 characters' }, 400);
  }
  if (text.length > 50_000) {
    return c.json({ error: 'bad_request', message: 'text exceeds 50KB limit' }, 413);
  }
  const useLlm = body.useLlm !== false;

  // Cache key by the first 64 chars + length. The 5-minute TTL is
  // short enough that a "stale" entry is acceptable but long enough to
  // dedup re-renders / refreshes.
  const key = cacheKey(text, useLlm);
  try {
    const cached = await caches.default.match(key);
    if (cached) {
      const data = await cached.json();
      return c.json(data, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
    }
  } catch (_catchErr) {
    console.error('ttpExtractHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* miss — proceed */
  }

  let result: { techniques: TtpHit[]; model: string; source: 'keyword' | 'llm' | 'merged'; error?: string };
  if (useLlm) {
    result = await extractTTPsLLM(text, c.env);
  } else {
    result = { techniques: extractTTPsKeyword(text), model: 'keyword', source: 'keyword' };
  }

  safeNullLog(
    'cache-put-ttp-extract',
    caches.default.put(
      key,
      new Response(JSON.stringify(result), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_TTL}` },
      })
    )
  );

  return c.json(result, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
}
