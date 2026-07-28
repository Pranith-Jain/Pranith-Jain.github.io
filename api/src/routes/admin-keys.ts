/**
 * Admin API key management routes.
 * All routes require the master ADMIN_TOKEN (same as other admin surfaces).
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { requireAdmin, safeEqual } from '../lib/admin-auth';
import { generateApiKey, revokeApiKey, listApiKeys } from '../lib/auth';
import { badRequest, internalError } from '../lib/api-error';
import { safeNullLog } from '../lib/safe-catch';
import { auditAdminAction } from '../lib/admin-audit';
import { z } from 'zod';

const SESSION_COOKIE = 'admin_session';
const SESSION_MAX_AGE = 60 * 60; // 1 hour (seconds, for Set-Cookie max-age)

/**
 * Build the Set-Cookie header value for the admin session.
 * HttpOnly: JS cannot read the cookie (XSS cannot exfiltrate the token).
 * Secure: only sent over HTTPS.
 * SameSite=Strict: not sent on cross-origin requests (CSRF protection).
 * Path=/api: only sent to API routes (not static assets).
 *
 * The cookie value is `token:version` — the version allows server-side
 * revocation without rotating the token itself.
 */
function sessionCookie(token: string, version?: string): string {
  const value = version ? `${token}:${version}` : token;
  return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${SESSION_MAX_AGE}`;
}

const clearSessionCookie = `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0`;

/**
 * POST /api/v1/admin/session — create an admin session.
 *
 * Validates the admin token from the request body and sets an HttpOnly
 * cookie. The browser will send this cookie automatically on subsequent
 * requests, so the frontend no longer needs to store the token in
 * localStorage.
 *
 * The token is still accepted via Authorization/X-Admin-Token headers
 * for backward compatibility and non-browser clients.
 */
export async function createSessionHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const required = c.env.ADMIN_TOKEN;
  if (!required) return c.json({ error: 'admin endpoint disabled' }, 403);

  const body = await safeNullLog('parse-body-admin-session', c.req.json());
  const token = body?.token;
  if (typeof token !== 'string' || !token) {
    return badRequest(c, 'token field required');
  }
  if (!safeEqual(token, required)) {
    return c.json({ error: 'unauthorized', message: 'invalid admin token' }, 401);
  }

  auditAdminAction(c, 'api_key_create', { keyId: 'session', label: 'session-cookie', role: 'admin' });
  return c.json({ ok: true, expires_in_seconds: SESSION_MAX_AGE }, 200, {
    'Set-Cookie': sessionCookie(token, c.env.ADMIN_TOKEN_VERSION),
    'Cache-Control': 'no-store',
  });
}

/**
 * DELETE /api/v1/admin/session — clear the admin session cookie (logout).
 */
export async function deleteSessionHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  return c.json({ ok: true }, 200, {
    'Set-Cookie': clearSessionCookie,
    'Cache-Control': 'no-store',
  });
}

const createKeySchema = z.object({
  label: z.string().min(1).max(100),
  role: z.enum(['admin', 'readonly']).default('readonly'),
});

/**
 * POST /api/v1/admin/keys — create a new API key.
 */
export async function createApiKeyHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  const db = c.env.BRIEFINGS_DB;
  if (!db) return internalError(c, new Error('BRIEFINGS_DB not bound'));

  const body = await safeNullLog('parse-body-admin-create-key', c.req.json());
  const parsed = createKeySchema.safeParse(body);
  if (!parsed.success) return badRequest(c, parsed.error.issues.map((i) => i.message).join('; '));

  try {
    const { rawKey, keyId, prefix } = await generateApiKey(db, parsed.data.label, parsed.data.role);
    auditAdminAction(c, 'api_key_create', { keyId, label: parsed.data.label, role: parsed.data.role });
    return c.json({ key: rawKey, id: keyId, prefix, label: parsed.data.label, role: parsed.data.role }, 201, {
      'Cache-Control': 'no-store',
    });
  } catch (e) {
    console.error('createApiKeyHandler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

/**
 * GET /api/v1/admin/keys — list active keys (prefix + label only).
 */
export async function listApiKeysHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  const db = c.env.BRIEFINGS_DB;
  if (!db) return internalError(c, new Error('BRIEFINGS_DB not bound'));

  try {
    const keys = await listApiKeys(db);
    return c.json({ keys }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    console.error('listApiKeysHandler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}

/**
 * DELETE /api/v1/admin/keys/:id — revoke an API key.
 */
export async function revokeApiKeyHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  const db = c.env.BRIEFINGS_DB;
  if (!db) return internalError(c, new Error('BRIEFINGS_DB not bound'));

  const keyId = c.req.param('id');
  if (!keyId) return badRequest(c, 'missing key id');

  try {
    const revoked = await revokeApiKey(db, keyId);
    if (!revoked) return c.json({ error: 'not_found', message: 'key not found or already revoked' }, 404);
    auditAdminAction(c, 'api_key_revoke', { keyId });
    return c.json({ ok: true }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    console.error('revokeApiKeyHandler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, e);
  }
}
