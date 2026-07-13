import { Hono } from 'hono';
import type { Env } from '../env';
import { badRequest, internalError } from '../lib/api-error';
import { cerastSearch, isValidCerastQuery } from '../lib/cerast';

export const cerastRouter = new Hono<{ Bindings: Env }>();

cerastRouter.get('/cerast/search', async (c) => {
  const q = c.req.query('q');
  if (!q || !isValidCerastQuery(q)) {
    return badRequest(c, 'query must be at least 3 characters');
  }
  try {
    const result = await cerastSearch(q);
    return c.json(result);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `cerast_search_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
