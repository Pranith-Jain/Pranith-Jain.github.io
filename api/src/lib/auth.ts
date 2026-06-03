/**
 * API key authentication middleware.
 *
 * Supports three tiers:
 *   - `optional` — attaches user identity if key present, continues otherwise
 *   - `required` — rejects with 401 if key missing or invalid
 *   - `'external-only'` — allows same-origin (frontend) requests through without
 *     a key; external callers must provide a valid API key via Authorization or X-API-Key
 *
 * Keys are stored in D1 (hashed with SHA-256).
 * The raw key is returned once on creation and never stored.
 *
 * Usage:
 *   import { authenticate } from '../lib/auth';
 *   app.get('/api/v1/admin/*', authenticate('required'), adminHandler);
 *   app.get('/api/v1/*', authenticate('external-only'), handler);
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import type { Env } from '../env';
import { unauthorized } from './api-error';

/** Allowed origins that bypass API key requirement. */
const ALLOWED_ORIGINS = new Set(['https://pranithjain.qzz.io', 'http://localhost:5173', 'http://localhost:8787']);

/** Request paths that bypass API key auth — used for webhooks called by external services (Telegram, etc.). Handler-level auth (requireAdmin) still applies. */
const EXEMPT_PATHS = new Set([
  '/api/v1/telegram-leaks/bot-webhook',
  '/api/v1/telegram-leaks/register-webhook',
  // NOTE: removed the dead '/api/v1/telegram-leaks/trigger-scan' entry — no
  // handler is registered for it. Re-add ONLY together with a self-authenticating
  // handler, else a future handler at that path would be silently keyless + CSRF-exempt.
]);

export interface AuthUser {
  keyId: string;
  prefix: string;
  role: 'admin' | 'readonly';
}

async function hashKey(key: string): Promise<string> {
  const enc = new TextEncoder().encode(key);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex;
}

/**
 * Extract a candidate key from `Authorization: Bearer <key>` or `X-API-Key`.
 */
function extractKey(c: Context<{ Bindings: Env }>): string | null {
  const authz = c.req.header('authorization') ?? '';
  const bearer = /^Bearer\s+(.+)$/i.exec(authz)?.[1];
  if (bearer) return bearer;
  return c.req.header('x-api-key') ?? null;
}

/**
 * Check if request originates from the same site (frontend).
 * Uses Origin header (preferred) or Referer as fallback.
 */
function isSameOrigin(c: Context<{ Bindings: Env }>): boolean {
  const origin = c.req.header('origin') ?? '';
  const allowed = new Set(ALLOWED_ORIGINS);
  if (c.env?.SITE_URL) allowed.add(c.env.SITE_URL.replace(/\/$/, ''));
  if (origin && allowed.has(origin)) return true;
  // Compare the Referer's parsed ORIGIN, not a string prefix. A prefix match
  // let `https://pranithjain.qzz.io.evil.com/` satisfy the gate.
  const referer = c.req.header('referer') ?? '';
  if (referer) {
    try {
      if (allowed.has(new URL(referer).origin)) return true;
    } catch {
      /* malformed referer — fall through to deny */
    }
  }
  return false;
}

/**
 * Look up a hashed key in D1. Returns the key metadata or null.
 */
async function lookupKey(db: D1Database, hashed: string): Promise<AuthUser | null> {
  const row = await db
    .prepare('SELECT id, prefix, role FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL')
    .bind(hashed)
    .first<{ id: string; prefix: string; role: string }>();
  if (!row) return null;
  // Touch last_used_at — fire-and-forget.
  await db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').bind(new Date().toISOString(), row.id).run();
  return { keyId: row.id, prefix: row.prefix, role: row.role as 'admin' | 'readonly' };
}

/**
 * Authentication middleware.
 *
 * @param mode 'optional' | 'required' | 'external-only'
 *   - `optional` — attaches user if key present, allows anonymous
 *   - `required` — rejects unauthenticated with 401
 *   - `'external-only'` — same-origin passthrough; external callers need a key
 */
export function authenticate(mode: boolean | 'external-only'): MiddlewareHandler<{ Bindings: Env }> {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    // Exempt specific paths from auth (webhooks called by external services).
    if (EXEMPT_PATHS.has(c.req.path)) {
      return next();
    }

    // 'external-only': allow same-origin (frontend) without a key
    if (mode === 'external-only' && isSameOrigin(c)) {
      return next();
    }

    // CORS preflight carries no credentials and must always pass — the real
    // (keyed) request is gated separately.
    if (c.req.method === 'OPTIONS') {
      return next();
    }

    // External reads (GET/HEAD) are gated behind an API key. Mint one at /admin
    // and send it via `Authorization: Bearer <key>` or `X-API-Key`. The website
    // itself is exempt via the same-origin check above. Emergency valve:
    // set the OPEN_PUBLIC_READS secret to 'true' to restore keyless reads
    // without a redeploy.
    if (
      mode === 'external-only' &&
      c.env.OPEN_PUBLIC_READS === 'true' &&
      (c.req.method === 'GET' || c.req.method === 'HEAD')
    ) {
      return next();
    }

    const required = mode === true || mode === 'external-only';
    const raw = extractKey(c);
    if (!raw) {
      if (required) return unauthorized(c, 'api key required — provide via Authorization: Bearer or X-API-Key');
      return next();
    }

    const db = c.env.BRIEFINGS_DB;
    if (!db) {
      if (required) return unauthorized(c, 'auth backend unavailable');
      return next();
    }

    const hashed = await hashKey(raw);
    let user: AuthUser | null;
    try {
      user = await lookupKey(db, hashed);
    } catch {
      if (required) return unauthorized(c, 'auth backend unavailable');
      return next();
    }
    if (!user) {
      if (required) return unauthorized(c, 'invalid api key');
      return next();
    }

    // Attach user context.
    (c as Context & { user: AuthUser }).user = user;
    await next();
  };
}

/**
 * Generates a new API key (random 40-char hex).
 * Returns the raw key (only time it's visible) and the metadata.
 */
export async function generateApiKey(
  db: D1Database,
  label: string,
  role: 'admin' | 'readonly'
): Promise<{
  rawKey: string;
  keyId: string;
  prefix: string;
}> {
  // Use cryptographically secure random — Math.random() is predictable.
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const prefix = raw.slice(0, 8);
  const hashed = await hashKey(raw);
  const keyId = crypto.randomUUID();

  await db
    .prepare('INSERT INTO api_keys (id, key_hash, prefix, label, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(keyId, hashed, prefix, label, role, new Date().toISOString())
    .run();

  return { rawKey: raw, keyId, prefix };
}

/**
 * Revoke an API key by ID.
 */
export async function revokeApiKey(db: D1Database, keyId: string): Promise<boolean> {
  const result = await db
    .prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .bind(new Date().toISOString(), keyId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/**
 * List all non-revoked API keys (prefix + label only, never the full key).
 */
export async function listApiKeys(
  db: D1Database
): Promise<
  Array<{ id: string; prefix: string; label: string; role: string; created_at: string; last_used_at: string | null }>
> {
  const { results } = await db
    .prepare(
      'SELECT id, prefix, label, role, created_at, last_used_at FROM api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC'
    )
    .all<{
      id: string;
      prefix: string;
      label: string;
      role: string;
      created_at: string;
      last_used_at: string | null;
    }>();
  return results ?? [];
}
