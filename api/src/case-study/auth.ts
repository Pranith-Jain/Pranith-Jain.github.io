import type { MiddlewareHandler } from 'hono';
import type { Env } from '../env';

/**
 * Constant-time string compare. Removes the early-exit timing oracle of
 * `===`/`!==`. Length is compared first (lengths aren't secret here and a
 * length-dependent loop would itself leak), then every char is XOR-folded.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/**
 * Admin gate for the case-study pipeline.
 *
 * - Token is accepted ONLY via the `X-Admin-Token` request header. The
 *   previous `?t=` query fallback was removed: query strings leak into
 *   access logs, browser history, and the Referer header sent to every
 *   third-party resource the admin page loads.
 * - Fails closed: if ADMIN_TOKEN is unset the endpoint is disabled (403)
 *   rather than relying on `token !== undefined` semantics.
 * - Constant-time comparison to match the briefings/external-resources gates.
 */
export const requireAdminToken: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const required = c.env.ADMIN_TOKEN;
  if (!required) {
    return c.json({ error: 'admin endpoint disabled (ADMIN_TOKEN not set)' }, 403);
  }
  const token = c.req.header('x-admin-token') ?? '';
  if (!token || !safeEqual(token, required)) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
};
