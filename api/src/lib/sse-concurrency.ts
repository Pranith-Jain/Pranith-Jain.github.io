import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Cap concurrent SSE streams per IP.
 *
 * The KV-backed `rateLimit` middleware in ratelimit.ts counts request
 * starts within a sliding window — perfectly fine for short JSON GETs
 * but useless for SSE: a malicious client can hold N streams open for
 * 60s+ each. While they're open, every stream's producer is doing
 * provider fan-out → upstream burn proportional to N, not to the
 * advertised 30/min cap.
 *
 * This guard tracks live stream count via a short-lived KV counter
 * keyed by IP. Increment on entry, decrement on stream end (best-effort
 * via ctx.waitUntil so we never block the close path). KV is eventually
 * consistent so this is a soft cap — fine for defensive use, not a
 * hard DDoS mitigation. For real hard caps, a Durable Object would be
 * the right tool; we deliberately stay on KV here to avoid the cost
 * and complexity bump.
 *
 * The counter has a short TTL (90s) so a Worker that crashes mid-stream
 * doesn't leave a phantom slot reserved.
 */

const MAX_CONCURRENT = 5;
const COUNTER_TTL = 90;

export interface SseSlot {
  /** Call when the stream finishes (success OR error). */
  release: () => Promise<void>;
}

/**
 * Try to claim a concurrency slot for `ip`. Returns null if the IP is
 * over the cap (caller should respond 429), or a SseSlot whose
 * `release` MUST be called when the stream ends.
 *
 * No-ops cleanly when KV isn't bound (local dev, un-provisioned env).
 */
export async function claimSseSlot(c: Context<{ Bindings: Env }>, ip: string): Promise<SseSlot | null> {
  if (!c.env.KV_CACHE) {
    return { release: async () => {} };
  }
  const key = `sse:open:${ip}`;
  let count = 0;
  try {
    const raw = await c.env.KV_CACHE.get(key);
    count = raw ? parseInt(raw, 10) : 0;
  } catch {
    // KV transient error — fail open. The per-window rateLimit middleware
    // still applies, so we're not unprotected.
    return { release: async () => {} };
  }
  if (count >= MAX_CONCURRENT) return null;

  // Best-effort increment. KV is eventually consistent so two concurrent
  // requests at count=4 may both see 4 and both write 5 — acceptable
  // soft cap for the defensive use case.
  try {
    await c.env.KV_CACHE.put(key, String(count + 1), { expirationTtl: COUNTER_TTL });
  } catch {
    /* swallow — fail open */
  }

  // Release is intentionally a no-op now to halve the KV-write cost of
  // every SSE stream (was 2 writes per stream: acquire + decrement).
  // The COUNTER_TTL (90s) handles cleanup automatically — long enough
  // that legitimate concurrent streams still see each other, short
  // enough that a user who finishes a stream isn't blocked for long.
  // Trade-off: rolling 90s window instead of true live-stream count.
  // Acceptable: this is a soft cap; the real protection for SSE-driven
  // upstream burn lives in each stream's own provider-fan-out budget.
  return { release: async () => {} };
}

export const SSE_MAX_CONCURRENT = MAX_CONCURRENT;
