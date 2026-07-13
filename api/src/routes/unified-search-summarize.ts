/**
 * POST /api/v1/unified-search/summarize — opt-in AI summary of omnibox results.
 *
 * Public (same-origin) counterpart to the admin-gated /api/v1/ai-summary. It
 * reuses the SAME `generateAiSummary` engine (Groq llama-4-scout → Workers-AI
 * fallback; untrusted items fenced via prompt-fence; output validated) but is
 * keyed by the search query so every query caches independently. Fires at most
 * ONE LLM call per uncached query and degrades to 503 when generation is
 * unavailable (no GROQ key + Workers-AI failure) — the deterministic results
 * stay fully usable either way.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { generateAiSummary, type SummaryInput } from '../lib/ai-summary';
import { neutralizeUntrusted } from '../lib/prompt-fence';

const CACHE_TTL = 3600; // 1 hour — mirrors /api/v1/ai-summary.

interface SummarizeBody {
  q: string;
  items: SummaryInput['items'];
}

function cacheKey(q: string): Request {
  return new Request(`https://unified-search-summary.internal/v1/${encodeURIComponent(q.toLowerCase())}`);
}

export async function unifiedSearchSummarizeHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: SummarizeBody;
  try {
    body = await c.req.json<SummarizeBody>();
  } catch (_catchErr) {
    console.error('unifiedSearchSummarizeHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ error: 'bad_request', message: 'invalid JSON body' }, 400);
  }

  const q = (body.q ?? '').trim();
  const issues: string[] = [];
  if (!q) issues.push('q is empty');
  if (!Array.isArray(body.items)) issues.push('items is not an array');
  else if (body.items.length === 0) issues.push('items is empty');
  else {
    for (let i = 0; i < body.items.length; i++) {
      const it = body.items[i]!;
      if (!it.title) issues.push(`items[${i}].title missing`);
      if (it.source && it.source.length > 200) issues.push(`items[${i}].source too long (${it.source.length})`);
    }
  }
  if (issues.length > 0) {
    return c.json({ error: 'bad_request', message: 'validation failed', issues }, 400);
  }

  // Cap items to bound LLM cost (the validate() schema also enforces max 50).
  const items = body.items.slice(0, 50);

  // Serve a cached summary for repeat clicks of the same query.
  const key = cacheKey(q);
  try {
    const cached = await caches.default.match(key);
    if (cached) {
      const data = await cached.json();
      return c.json(data, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
    }
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* cache miss — proceed */
  }

  // Surface carries the query so the LLM has the search context; date is today.
  // `q` is USER-CONTROLLED and the surface is interpolated UNFENCED into the LLM
  // prompt (ai-summary.ts builds `Surface: ${surface}` outside the fence), so it
  // must be neutralized here or a crafted query becomes a prompt-injection vector.
  const input: SummaryInput = {
    surface: `Unified Search: ${neutralizeUntrusted(q)}`,
    date: new Date().toISOString().slice(0, 10),
    items,
  };
  const result = await generateAiSummary(input, c.env);
  if (!result) {
    return c.json({ error: 'unavailable', message: 'AI summary generation failed' }, 503);
  }

  try {
    await caches.default.put(
      key,
      new Response(JSON.stringify(result), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_TTL}` },
      })
    );
  } catch (_catchErr) {
    console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    /* best-effort cache write */
  }

  return c.json(result, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
}
