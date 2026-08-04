import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, tooManyRequests } from '../lib/api-error';
import { requireAdmin } from '../lib/admin-auth';
import { X_COOKIES_KV_KEY, validateXCookiesShape, type StoredXCookies } from '../lib/twitter-auth-graphql';

/**
 * Admin-managed X (Twitter) session cookies.
 *
 * The X integration authenticates with a personal account's `auth_token` +
 * `ct0` cookies (see lib/twitter-auth-graphql.ts). Historically these were
 * worker secrets only (`wrangler secret put X_AUTH_TOKEN`), which rotate
 * ~30 days and require CLI access to refresh. This endpoint lets an operator
 * update them from the admin UI instead.
 *
 * Storage: single KV value at `admin:x-cookies:v1` in KV_CACHE. The resolver
 * (`resolveAuthCookies`) prefers this KV override and falls back to the
 * worker secrets, so deleting the KV value reverts to secret-based auth.
 *
 * Security: gated by `requireAdmin` (constant-time ADMIN_TOKEN compare). The
 * GET handler NEVER returns raw cookie values - only a set/unset flag and the
 * last-4 chars, so a leaked admin session can't exfiltrate the full cookies.
 */

type AdminCtx = Context<{ Bindings: Env }>;

function mask(v: string): { set: boolean; last4: string } {
  const s = v.trim();
  return { set: s.length > 0, last4: s.length >= 4 ? s.slice(-4) : '' };
}

async function readStored(kv: KVNamespace): Promise<StoredXCookies | null> {
  try {
    const raw = await kv.get(X_COOKIES_KV_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredXCookies;
  } catch {
    return null;
  }
}

/** GET /api/v1/admin/x-cookies - masked status; never returns raw cookies. */
export async function getXCookiesHandler(c: AdminCtx): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV_CACHE not bound');

  const stored = await readStored(kv);
  const kvValid = !!stored && !validateXCookiesShape(stored.authToken ?? '', stored.ct0 ?? '');

  const envAuthToken = (c.env.X_AUTH_TOKEN ?? '').trim();
  const envCt0 = (c.env.X_CT0 ?? '').trim();
  const envValid = !validateXCookiesShape(envAuthToken, envCt0);

  const source: 'kv' | 'env' | 'none' = kvValid ? 'kv' : envValid ? 'env' : 'none';
  const authToken = kvValid ? stored!.authToken : envAuthToken;
  const ct0 = kvValid ? stored!.ct0 : envCt0;

  return c.json(
    {
      source,
      configured: source !== 'none',
      authToken: mask(authToken),
      ct0: mask(ct0),
      bearerOverridden: kvValid ? !!stored!.bearer : false,
      updatedAt: stored?.updatedAt ?? null,
    },
    200,
    { 'cache-control': 'no-store' }
  );
}

/** POST /api/v1/admin/x-cookies - validate + persist the KV override. */
export async function setXCookiesHandler(c: AdminCtx): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV_CACHE not bound');

  let body: { authToken?: string; ct0?: string; bearer?: string };
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    return badRequest(c, 'invalid JSON body');
  }

  const authToken = (body.authToken ?? '').trim();
  const ct0 = (body.ct0 ?? '').trim();
  const bearer = (body.bearer ?? '').trim();

  const shapeErr = validateXCookiesShape(authToken, ct0);
  if (shapeErr) return badRequest(c, shapeErr);

  const stored: StoredXCookies = {
    authToken,
    ct0,
    updatedAt: new Date().toISOString(),
    ...(bearer ? { bearer } : {}),
  };
  await kv.put(X_COOKIES_KV_KEY, JSON.stringify(stored));

  return c.json(
    { ok: true, source: 'kv', authToken: mask(authToken), ct0: mask(ct0), updatedAt: stored.updatedAt },
    200,
    { 'cache-control': 'no-store' }
  );
}

/** DELETE /api/v1/admin/x-cookies - clear the KV override (revert to secrets). */
export async function clearXCookiesHandler(c: AdminCtx): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV_CACHE not bound');

  await kv.delete(X_COOKIES_KV_KEY);

  const envAuthToken = (c.env.X_AUTH_TOKEN ?? '').trim();
  const envCt0 = (c.env.X_CT0 ?? '').trim();
  const envValid = !validateXCookiesShape(envAuthToken, envCt0);

  return c.json({ ok: true, source: envValid ? 'env' : 'none' }, 200, { 'cache-control': 'no-store' });
}
