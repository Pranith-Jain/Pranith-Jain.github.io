import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../env';

/**
 * Shared admin gate for mutation endpoints.
 *
 * Accepts the token from EITHER:
 *   - `Authorization: Bearer <token>` (preferred)
 *   - `X-Admin-Token: <token>` (legacy, used by case-study admin UI)
 *
 * Both frontend helpers (adminApi.ts → X-Admin-Token, admin-token.ts →
 * Authorization: Bearer) are now supported by every admin gate.
 *
 * Backed by the single `ADMIN_TOKEN` Worker secret. One token, all admin
 * surfaces — campaigns, external-resources, telegram custom channels,
 * case-study pipeline, and intel-bundle inspect.
 *
 * Caller pattern:
 *
 *   const gate = requireAdmin(c);
 *   if ('error' in gate) return gate.error;
 */

type AdminCtx = Context<{ Bindings: Env }>;

/**
 * Constant-time string comparison. Folds the length check into the
 * accumulator and always iterates over the SECRET (`b`) length, so a
 * wrong-length candidate does not short-circuit and leak the secret's
 * length via response timing. Out-of-range `a.charCodeAt(i)` is NaN, and
 * `NaN | 0 === 0`, so a shorter candidate still runs the full loop.
 */
export function safeEqual(a: string, b: string): boolean {
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < b.length; i += 1) {
    mismatch |= (a.charCodeAt(i) | 0) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Extract a candidate token from the request, checking both
 * `Authorization: Bearer` and `X-Admin-Token`. Returns empty string
 * when neither is present.
 */
function extractToken(c: AdminCtx): string {
  const authz = c.req.header('authorization') ?? '';
  const bearer = /^Bearer\s+(.+)$/i.exec(authz)?.[1];
  if (bearer) return bearer;
  return c.req.header('x-admin-token') ?? '';
}

export function requireAdmin(c: AdminCtx): { error: Response } | { ok: true } {
  const required = c.env.ADMIN_TOKEN;
  if (!required) {
    return { error: c.json({ error: 'admin endpoint disabled' }, 403) };
  }
  const token = extractToken(c);
  if (!token || !safeEqual(token, required)) {
    return { error: c.json({ error: 'unauthorized' }, 401) };
  }
  return { ok: true };
}

/** Hono middleware version of requireAdmin (for app-level guards). */
export const requireAdminMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  // Internal requests from our own Durable Objects bypass admin gate.
  if (c.req.header('x-internal-agent') === 'investigator-do') {
    return next();
  }
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;
  await next();
};
