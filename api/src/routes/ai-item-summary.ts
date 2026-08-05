/**
 * /api/v1/ai-item-summary — per-post AI summaries (batched).
 *
 * POST body: { surface: string, items: Array<{ id, title, body?, source? }> }
 * Returns:   { summaries: { [id]: string }, modelHint: 'groq:openai/gpt-oss-120b' }
 *
 * Each item is summarised at most once and cached in KV by content hash
 * (see lib/ai-item-summary.ts), so repeated loads / cross-page reuse are free.
 * The item cap + small concurrency bound the LLM cost and subrequest count
 * (Free-plan 50/invocation: ≤ MAX_ITEMS × 3 KV/LLM subrequests stays well under).
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, unauthorized, forbidden } from '../lib/api-error';
import { generateItemSummary, type ItemInput } from '../lib/ai-item-summary';

interface ItemSummaryBody {
  surface?: string;
  items?: ItemInput[];
}

const MAX_ITEMS = 10;
const CONCURRENCY = 4;

export async function aiItemSummaryHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: ItemSummaryBody;
  try {
    body = await c.req.json<ItemSummaryBody>();
  } catch (_catchErr) {
    logError('aiItemSummaryHandler failed', _catchErr);
    return badRequest(c, 'invalid JSON body');
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return badRequest(c, 'requires non-empty items[]');
  }

  // Cap to bound LLM cost + subrequests. Drop malformed entries (no id/title).
  const items = body.items
    .filter((it): it is ItemInput => !!it && typeof it.id === 'string' && typeof it.title === 'string')
    .slice(0, MAX_ITEMS);

  if (items.length === 0) {
    return badRequest(c, 'items need string id + title');
  }

  const summaries: Record<string, string> = {};

  // Bounded concurrency so a cold batch doesn't fan out N parallel Groq calls.
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      const item = items[idx]!;
      const summary = await generateItemSummary(item, c.env);
      if (summary) summaries[item.id] = summary;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()));

  return c.json({ summaries, modelHint: 'groq:openai/gpt-oss-120b' }, 200, { 'cache-control': 'private, max-age=300' });
}
