import type { Context } from 'hono';
import type { Env } from '../env';

/**
 * Shared Bearer-token gate for mutation endpoints.
 *
 * Backed by the existing `ADMIN_TOKEN` Worker secret (already required
 * by env.ts and used by case-study + intel-bundle admin paths). One
 * token, all admin surfaces — campaigns, external-resources, telegram
 * custom channels. Returns generic responses so the env-var name never
 * appears on the wire.
 *
 * Caller pattern:
 *
 *   const gate = requireAdmin(c);
 *   if ('error' in gate) return gate.error;
 *
 * The FE pages keep an opaque admin token in localStorage under the
 * key `resources-admin-token` (retained for back-compat) and send it
 * as `Authorization: Bearer <token>` via src/lib/admin-token.ts.
 */

type AdminCtx = Context<{ Bindings: Env }>;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function requireAdmin(c: AdminCtx): { error: Response } | { ok: true } {
  const required = c.env.ADMIN_TOKEN;
  if (!required) {
    // No env name in the response — operators see a generic "disabled"
    // string; the deployment team knows which secret to set from docs.
    return { error: c.json({ error: 'admin endpoint disabled' }, 403) };
  }
  const authz = c.req.header('authorization') ?? '';
  const headerToken = /^Bearer\s+(.+)$/i.exec(authz)?.[1];
  if (headerToken && safeEqual(headerToken, required)) {
    return { ok: true };
  }
  return { error: c.json({ error: 'unauthorized' }, 401) };
}
