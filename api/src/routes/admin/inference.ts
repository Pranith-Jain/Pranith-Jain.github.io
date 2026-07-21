import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { Env } from '../../env';
import { getMonthlyCount, isOverSpendCap } from '../../case-study/analytics/inference-counter';

export const inferenceRouter = new Hono<{ Bindings: Env }>();

// Inference cost stats for the admin header display. Best-effort — returns
// zeroes when D1 is unavailable so the UI never breaks.
inferenceRouter.get('/inference-stats', async (c) => {
  try {
    const db = c.env.BRIEFINGS_DB as D1Database | undefined;
    if (!db) return c.json({ calls: 0, totalTokens: 0, estimatedCostCents: 0, overCap: false });
    const count = await getMonthlyCount(db);
    const overCap = await isOverSpendCap(db);
    return c.json({
      calls: count.calls,
      totalTokens: count.total_tokens,
      estimatedCostCents: Math.round(count.estimated_cost_cents * 100) / 100,
      overCap,
    });
  } catch {
    return c.json({ calls: 0, totalTokens: 0, estimatedCostCents: 0, overCap: false });
  }
});
