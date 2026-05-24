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

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
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
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;
  await next();
};
