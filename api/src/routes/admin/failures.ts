import { Hono } from 'hono';
import type { Env } from '../../env';
import { listFailures, deleteFailure, clearFailures } from '../../case-study/storage/failed';

export const failuresRouter = new Hono<{ Bindings: Env }>();

failuresRouter.get('/failures', async (c) => {
  return c.json({ failures: await listFailures(c.env.CASE_STUDIES) });
});

failuresRouter.post('/failures/:slotId/clear', async (c) => {
  await deleteFailure(c.env.CASE_STUDIES, c.req.param('slotId'));
  return c.json({ ok: true });
});

failuresRouter.post('/failures/clear-all', async (c) => {
  const cleared = await clearFailures(c.env.CASE_STUDIES);
  return c.json({ ok: true, cleared });
});
