import type { D1Database } from '@cloudflare/workers-types';

export interface InferenceCount {
  month: string;
  calls: number;
  total_tokens: number;
  estimated_cost_cents: number;
}

/** Return the current month's inference count. Creates a row if none exists. */
export async function getMonthlyCount(db: D1Database): Promise<InferenceCount> {
  const month = new Date().toISOString().slice(0, 7);
  const row = await db
    .prepare(
      `SELECT month, calls, total_tokens, estimated_cost_cents
       FROM inference_counter WHERE month = ?`
    )
    .bind(month)
    .first<InferenceCount>();
  return row ?? { month, calls: 0, total_tokens: 0, estimated_cost_cents: 0 };
}

/** Record an inference call. Increments the monthly counters.
 *  Estimated cost: ~$0.15/1M tokens for Groq (mixtral), ~$0.50/1M for Gemini,
 *  ~$0.20/1M for NVIDIA. We use a blended $0.15/1M as a conservative baseline. */
export async function recordInference(db: D1Database, tokens: number): Promise<void> {
  const costPer1M = 0.15; // blended $/1M tokens
  const cost = (tokens / 1_000_000) * costPer1M;
  await db
    .prepare(
      `INSERT INTO inference_counter (month, calls, total_tokens, estimated_cost_cents)
       VALUES (strftime('%Y-%m', 'now'), 1, ?, ?)
       ON CONFLICT(month) DO UPDATE SET
         calls = calls + 1,
         total_tokens = total_tokens + excluded.total_tokens,
         estimated_cost_cents = estimated_cost_cents + excluded.estimated_cost_cents`
    )
    .bind(tokens, cost * 100)
    .run();
}

/** Check whether the monthly spend cap has been exceeded.
 *  Default cap: 5000 cents ($50) per month. Returns true when exceeded. */
export async function isOverSpendCap(db: D1Database, maxCents = 5000): Promise<boolean> {
  const row = await getMonthlyCount(db);
  return row.estimated_cost_cents >= maxCents;
}
