import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, unauthorized, conflict } from '../lib/api-error';
import { safeJsonBody } from '../lib/safe-body';
import { requireAdmin } from '../lib/admin-auth';
import { safeNullLog } from '../lib/safe-catch';

/**
 * Runtime-editable layer on top of the static External Resources catalog
 * shipped in src/data/threatintel/external-resources.ts.
 *
 * The static array stays in source (curated, versioned). This module adds
 * a dynamic JSON array persisted in KV that the frontend merges with the
 * static entries at render time. New finds can be added from the website
 * itself (auth-gated) without a git commit + redeploy cycle.
 *
 * Storage: single KV value at `external-resources:dynamic` holding the
 * full ExternalResource[]. Atomic JSON read/write. Capped at 500 entries
 * to keep the payload under 100 KB even with verbose `why` notes.
 *
 * Auth: Bearer token compared in constant time against the worker secret
 * RESOURCES_ADMIN_TOKEN. If the secret is unset, the write endpoints
 * return 403 ("admin endpoint disabled") so an accidentally deployed
 * worker can't be tampered with.
 */

const KV_KEY = 'external-resources:dynamic';
const RES_CACHE_KEY = 'https://external-resources-cache.internal/v1';
const RES_CACHE_TTL = 30;
const MAX_ENTRIES = 500;

function resCacheApi(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch (_catchErr) {
    logError('resCacheApi failed', _catchErr);
    return null;
  }
}

type ResourceKind = 'training' | 'lab' | 'tool' | 'dashboard' | 'directory' | 'samples' | 'community' | 'research';

const ALLOWED_KINDS: ReadonlySet<string> = new Set([
  'training',
  'lab',
  'tool',
  'dashboard',
  'directory',
  'samples',
  'community',
  'research',
]);

interface ExternalResource {
  id: string;
  name: string;
  url: string;
  kind: ResourceKind;
  description: string;
  why?: string;
  /** ISO timestamp the entry was added via this API. Static entries omit it. */
  added_at: string;
}

type AdminCtx = Context<{ Bindings: Env }>;
// `requireAdmin` now lives in lib/admin-auth.ts — single helper shared by
// campaigns, telegram custom channels, and this module. Its responses are
// generic ("admin endpoint disabled" / "unauthorized") so the env var name
// never appears on the wire.

async function readDynamic(kv: KVNamespace): Promise<ExternalResource[]> {
  const cache = resCacheApi();
  if (cache) {
    try {
      const r = await cache.match(RES_CACHE_KEY);
      if (r) return (await r.json()) as ExternalResource[];
    } catch (_catchErr) {
      logError('readDynamic failed', _catchErr);
      /* fall through */
    }
  }
  const raw = await kv.get(KV_KEY, 'json');
  if (!raw || !Array.isArray(raw)) return [];
  const items = raw as ExternalResource[];
  if (cache && items.length > 0) {
    safeNullLog(
      'cache-put-ext-resources',
      cache.put(
        RES_CACHE_KEY,
        new Response(JSON.stringify(items), { headers: { 'cache-control': `max-age=${RES_CACHE_TTL}` } })
      )
    );
  }
  return items;
}

async function writeDynamic(kv: KVNamespace, items: ExternalResource[]): Promise<void> {
  await kv.put(KV_KEY, JSON.stringify(items));
  const cache = resCacheApi();
  if (cache) {
    safeNullLog(
      'cache-put-ext-resources-save',
      cache.put(
        RES_CACHE_KEY,
        new Response(JSON.stringify(items), { headers: { 'cache-control': `max-age=${RES_CACHE_TTL}` } })
      )
    );
  }
}

/**
 * Slug derivation: hostname stripped of `www.`, `.com` etc → kebab, plus a
 * short random suffix to avoid collisions when the same host is added twice.
 * Collisions across host + suffix are statistically impossible at this scale.
 */
function deriveId(url: string): string {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch (_catchErr) {
    logError('deriveId failed', _catchErr);
    host = 'entry';
  }
  host = host.replace(/^www\./, '').replace(/[^a-z0-9.-]+/g, '');
  const base = host.split('.').slice(0, -1).join('-') || host || 'entry';
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${base}-${suffix}`
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function trim(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s.trim().slice(0, max);
}

export async function listExternalResourcesHandler(c: Context<{ Bindings: Env }>) {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ items: [] }, 200, { 'cache-control': 'no-store' });
  const items = await readDynamic(kv);
  return c.json({ items }, 200, { 'cache-control': 'public, max-age=30, s-maxage=60' });
}

export async function createExternalResourceHandler(c: AdminCtx) {
  const auth = requireAdmin(c);
  if ('error' in auth) return auth.error;

  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV_CACHE not bound');

  // Size + depth-guarded JSON read. Each external-resource entry is a small
  // bag of strings (name/url/kind/description/why); 8 KB is plenty.
  const parsed = await safeJsonBody<Record<string, unknown>>(c, { maxBytes: 8 * 1024, maxDepth: 4 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  const name = trim(body.name, 120);
  const url = trim(body.url, 600);
  const kindRaw = trim(body.kind, 32);
  const description = trim(body.description, 600);
  const why = trim(body.why, 600);

  if (!name) return badRequest(c, 'name is required');
  if (!url) return badRequest(c, 'url is required');
  if (!ALLOWED_KINDS.has(kindRaw)) {
    return badRequest(c, `kind must be one of: ${[...ALLOWED_KINDS].join(', ')}`);
  }
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return badRequest(c, 'url must use http or https');
    }
  } catch (_catchErr) {
    logError('createExternalResourceHandler failed', _catchErr);
    return badRequest(c, 'url is malformed');
  }

  const items = await readDynamic(kv);
  if (items.length >= MAX_ENTRIES) {
    return badRequest(c, `dynamic catalog is full (${MAX_ENTRIES} entries); delete one first`);
  }

  // Reject exact-URL duplicates against the existing dynamic set so the
  // editor doesn't accidentally double-save the same site on a refresh.
  // The frontend already de-dupes against static + dynamic at render time;
  // this guard is the server-side belt-and-braces.
  if (items.some((it) => it.url === url)) {
    return conflict(c, 'this URL is already in the dynamic catalog');
  }

  const entry: ExternalResource = {
    id: deriveId(url),
    name,
    url,
    kind: kindRaw as ResourceKind,
    description: description || name,
    added_at: new Date().toISOString(),
  };
  if (why) entry.why = why;

  // Prepend so newest sorts first when the frontend doesn't otherwise order.
  const next = [entry, ...items];
  await writeDynamic(kv, next);
  return c.json({ ok: true, entry }, 201);
}

export async function deleteExternalResourceHandler(c: AdminCtx) {
  const auth = requireAdmin(c);
  if ('error' in auth) return auth.error;

  const kv = c.env.KV_CACHE;
  if (!kv) return serviceUnavailable(c, 'KV_CACHE not bound');

  const id = c.req.param('id');
  if (!id || !/^[a-z0-9-]+$/.test(id)) return badRequest(c, 'invalid id');

  const items = await readDynamic(kv);
  const next = items.filter((it) => it.id !== id);
  if (next.length === items.length) return notFound(c, 'not found');

  await writeDynamic(kv, next);
  return c.json({ ok: true, deleted: id });
}
