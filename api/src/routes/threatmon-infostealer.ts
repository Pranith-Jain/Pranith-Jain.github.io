import { Hono } from 'hono';
import type { Env } from '../env';
import { badRequest, internalError } from '../lib/api-error';
import { threatmonInfostealerSearch } from '../lib/threatmon-infostealer';

export const threatmonInfostealerRouter = new Hono<{ Bindings: Env }>();

threatmonInfostealerRouter.get('/threatmon/infostealer', async (c) => {
  const domain = c.req.query('domain');
  if (!domain || domain.trim().length < 2) {
    return badRequest(c, 'domain must be at least 2 characters');
  }
  const scope = c.req.query('scope');
  const validScope = scope === 'third-party' ? 'third-party' : 'company';
  try {
    const result = await threatmonInfostealerSearch(domain, validScope);
    return c.json(result);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `threatmon_infostealer_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
