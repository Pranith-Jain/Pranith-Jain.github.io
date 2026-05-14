import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';

export const requireAdminToken: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const token = c.req.header('x-admin-token') ?? c.req.query('t');
  if (!token || token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
};
