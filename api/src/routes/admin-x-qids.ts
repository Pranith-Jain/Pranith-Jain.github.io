import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest, serviceUnavailable } from '../lib/api-error';
import { requireAdmin } from '../lib/admin-auth';
import {
  X_QIDS_KV_KEY,
  isValidQid,
  resolveQueryIds,
  invalidateQidCache,
  type QueryIds,
} from '../lib/twitter-auth-graphql';

/**
 * Admin-managed X (Twitter) GraphQL query IDs.
 *
 * X rotates its GraphQL query IDs every few weeks; when they go stale every
 * authed X fetch fails with a "Twitter GraphQL error". Historically the IDs
 * were hardcoded constants requiring a redeploy to refresh. This endpoint
 * stores an override in KV (`admin:x-qids:v1`) that `resolveQueryIds` prefers,
 * falling back per-field to the hardcoded defaults - so an operator can paste
 * fresh IDs from the admin UI without redeploying.
 *
 * Query IDs are not secret (they ship in x.com's public JS bundle), so the GET
 * handler returns them in full. Gated by `requireAdmin`.
 */

type AdminCtx = Context<{ Bindings: Env }>;

const QID_FIELDS: Array<keyof QueryIds> = ['userByScreenName', 'userTweets', 'userTweetsAndReplies', 'searchTimeline'];

interface StoredQids extends Partial<QueryIds> {
  updatedAt?: string;
}

async function readStoredQids(kv: KVNamespace): Promise<StoredQids | null> {
  try {
    const raw = await kv.get(X_QIDS_KV_KEY);
    return raw ? (JSON.parse(raw) as StoredQids) : null;
  } catch {
    return null;
  }
}

/** GET /api/v1/admin/x-qids - effective IDs + which fields are overridden. */
export async function getXQidsHandler(c: AdminCtx): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV_CACHE not bound');

  const stored = await readStoredQids(kv);
  const effective = await resolveQueryIds(c.env);
  const overridden: Record<keyof QueryIds, boolean> = {
    userByScreenName: !!stored && isValidQid(stored.userByScreenName),
    userTweets: !!stored && isValidQid(stored.userTweets),
    userTweetsAndReplies: !!stored && isValidQid(stored.userTweetsAndReplies),
    searchTimeline: !!stored && isValidQid(stored.searchTimeline),
  };
  const source: 'kv' | 'default' = Object.values(overridden).some(Boolean) ? 'kv' : 'default';

  return c.json({ source, qids: effective, overridden, updatedAt: stored?.updatedAt ?? null }, 200, {
    'cache-control': 'no-store',
  });
}

/** POST /api/v1/admin/x-qids - merge provided IDs over current, persist all four. */
export async function setXQidsHandler(c: AdminCtx): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV_CACHE not bound');

  let body: Partial<QueryIds>;
  try {
    body = (await c.req.json()) as Partial<QueryIds>;
  } catch {
    return badRequest(c, 'invalid JSON body');
  }

  const merged: QueryIds = { ...(await resolveQueryIds(c.env)) };
  for (const field of QID_FIELDS) {
    const raw = body[field];
    if (raw === undefined) continue;
    const val = String(raw).trim();
    if (val === '') continue;
    if (!isValidQid(val)) return badRequest(c, `invalid query ID for ${field}`);
    merged[field] = val;
  }

  const updatedAt = new Date().toISOString();
  await kv.put(X_QIDS_KV_KEY, JSON.stringify({ ...merged, updatedAt }));
  invalidateQidCache();

  return c.json({ ok: true, source: 'kv', qids: merged, updatedAt }, 200, { 'cache-control': 'no-store' });
}

/** DELETE /api/v1/admin/x-qids - clear the override (revert to hardcoded defaults). */
export async function clearXQidsHandler(c: AdminCtx): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;

  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV_CACHE not bound');

  await kv.delete(X_QIDS_KV_KEY);
  invalidateQidCache();

  return c.json({ ok: true, source: 'default' }, 200, { 'cache-control': 'no-store' });
}
