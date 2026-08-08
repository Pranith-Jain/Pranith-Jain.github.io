/**
 * /api/v1/ai-summary — on-demand AI summary for feed surfaces.
 *
 * POST body: { surface: string, date: string, items: Array<{title, body, source?}> }
 * Returns: { summary, modelUsed, itemCount } or 503 on failure.
 *
 * Rate-limited to prevent LLM cost abuse. Cached per (surface, date) in
 * the Cache API for 1 hour so repeated page loads don't re-invoke the LLM.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, serviceUnavailable } from '../lib/api-error';
import { generateAiSummary, type SummaryInput } from '../lib/ai-summary';

const CACHE_TTL = 3600; // 1 hour

function cacheKey(surface: string, date: string): Request {
  return new Request(`https://ai-summary.internal/v1/${encodeURIComponent(surface)}@${date}`);
}

export async function aiSummaryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // Body already validated + parsed by validate() middleware; use c.parsed.
  const parsed = (c as Context & { parsed?: SummaryInput }).parsed;
  const body: SummaryInput = parsed ?? (await c.req.json<SummaryInput>().catch(() => ({}) as SummaryInput));
  if (!body) {
    return badRequest(c, 'invalid JSON body');
  }

  if (!body.surface || !body.date || !Array.isArray(body.items) || body.items.length === 0) {
    return badRequest(c, 'requires surface, date, and non-empty items[]');
  }

  // Cap items to prevent LLM cost explosion.
  if (body.items.length > 50) {
    body.items = body.items.slice(0, 50);
  }

  // Check cache first.
  const key = cacheKey(body.surface, body.date);
  try {
    const cached = await caches.default.match(key);
    if (cached) {
      const data = await cached.json();
      return c.json(data, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
    }
  } catch (_catchErr) {
    logError('aiSummaryHandler failed', _catchErr);
    /* cache miss — proceed */
  }

  const result = await generateAiSummary(body, c.env);
  if (!result) {
    return serviceUnavailable(c, 'AI summary generation failed');
  }

  // Cache the result.
  try {
    await caches.default.put(
      key,
      new Response(JSON.stringify(result), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_TTL}` },
      })
    );
  } catch (_catchErr) {
    logError('handler failed', _catchErr);
    /* best-effort */
  }

  return c.json(result, 200, { 'cache-control': `public, max-age=${CACHE_TTL}` });
}
