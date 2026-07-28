import { Hono } from 'hono';
import type { Env } from '../../env';

export const runRouter = new Hono<{ Bindings: Env }>();

runRouter.post('/run/:stage', async (c) => {
  const stage = c.req.param('stage');
  const { runDiscoveryNow, runPlannerNow, runPublisherNow } = await import('../../case-study/run');
  const { runTelegramArchive } = await import('../telegram-archive');
  const now = new Date();
  if (stage === 'discovery') {
    const result = await runDiscoveryNow(c.env as never, now);
    return c.json({ ok: true, stage, result });
  }
  if (stage === 'planner') {
    const result = await runPlannerNow(c.env as never, now);
    return c.json({ ok: true, stage, result });
  }
  if (stage === 'publisher') {
    const result = await runPublisherNow(c.env as never, now);
    return c.json({ ok: true, stage, result });
  }
  if (stage === 'telegram') {
    const result = await runTelegramArchive(c.env as never);
    return c.json({ ok: true, stage, result });
  }
  return c.json({ ok: false, error: `unknown stage: ${stage}` }, 400);
});
