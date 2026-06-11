import type { Context } from 'hono';
import type { Env } from '../env';
import { lookupHandle } from '../lib/scrapedintel';

const MIN_QUERY_LEN = 2;
const MAX_QUERY_LEN = 80; // upstream's own /api/search limit

/**
 * GET /api/v1/scrapedintel-usernames?q=<handle>
 *
 * Live forum-handle search via threatactorusernames.com (ScrapedIntel). Manual
 * validation mirrors the upstream 2–80 char bound; the lookup layer handles the
 * per-query cache, global egress budget, and last-good fallback.
 */
export async function scrapedintelUsernamesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < MIN_QUERY_LEN) {
    return c.json({ error: `query must be at least ${MIN_QUERY_LEN} characters` }, 400);
  }
  if (q.length > MAX_QUERY_LEN) {
    return c.json({ error: `query too long (max ${MAX_QUERY_LEN} chars)` }, 400);
  }

  const out = await lookupHandle(q, c.env);
  return c.json(out.data, out.status, { 'Cache-Control': out.cacheControl });
}
