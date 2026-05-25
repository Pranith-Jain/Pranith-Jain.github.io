/**
 * Admin API key management routes.
 * All routes require the master ADMIN_TOKEN (same as other admin surfaces).
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { requireAdmin } from '../lib/admin-auth';
import { generateApiKey, revokeApiKey, listApiKeys } from '../lib/auth';
import { badRequest, internalError } from '../lib/api-error';
import { z } from 'zod';

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

  const body = await c.req.json().catch(() => null);
  const parsed = createKeySchema.safeParse(body);
  if (!parsed.success) return badRequest(c, parsed.error.issues.map((i) => i.message).join('; '));

  try {
    const { rawKey, keyId, prefix } = await generateApiKey(db, parsed.data.label, parsed.data.role);
    return c.json({ key: rawKey, id: keyId, prefix, label: parsed.data.label, role: parsed.data.role }, 201, {
      'Cache-Control': 'no-store',
    });
  } catch (e) {
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
    return c.json({ ok: true }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return internalError(c, e);
  }
}
