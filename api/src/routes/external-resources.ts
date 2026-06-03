import type { Context } from 'hono';
import type { Env } from '../env';
import { safeJsonBody } from '../lib/safe-body';
import { requireAdmin } from '../lib/admin-auth';

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
  } catch {
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
    } catch {
      /* fall through */
    }
  }
  const raw = await kv.get(KV_KEY, 'json');
  if (!raw || !Array.isArray(raw)) return [];
  const items = raw as ExternalResource[];
  if (cache && items.length > 0) {
    cache
      .put(
        RES_CACHE_KEY,
        new Response(JSON.stringify(items), { headers: { 'cache-control': `max-age=${RES_CACHE_TTL}` } })
      )
      .catch(() => {});
  }
  return items;
}

async function writeDynamic(kv: KVNamespace, items: ExternalResource[]): Promise<void> {
  await kv.put(KV_KEY, JSON.stringify(items));
  const cache = resCacheApi();
  if (cache) {
    cache
      .put(
        RES_CACHE_KEY,
        new Response(JSON.stringify(items), { headers: { 'cache-control': `max-age=${RES_CACHE_TTL}` } })
      )
      .catch(() => {});
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
  } catch {
    host = 'entry';
  }
  host = host.replace(/^www\./, '').replace(/[^a-z0-9.-]+/g, '');
  const base = host.split('.').slice(0, -1).join('-') || host || 'entry';
  const suffix = Math.random().toString(36).slice(2, 6);
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
  if (!kv) return c.json({ error: 'KV_CACHE not bound' }, 503);

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

  if (!name) return c.json({ error: 'name is required' }, 400);
  if (!url) return c.json({ error: 'url is required' }, 400);
  if (!ALLOWED_KINDS.has(kindRaw)) {
    return c.json({ error: `kind must be one of: ${[...ALLOWED_KINDS].join(', ')}` }, 400);
  }
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return c.json({ error: 'url must use http or https' }, 400);
    }
  } catch {
    return c.json({ error: 'url is malformed' }, 400);
  }

  const items = await readDynamic(kv);
  if (items.length >= MAX_ENTRIES) {
    return c.json({ error: `dynamic catalog is full (${MAX_ENTRIES} entries); delete one first` }, 400);
  }

  // Reject exact-URL duplicates against the existing dynamic set so the
  // editor doesn't accidentally double-save the same site on a refresh.
  // The frontend already de-dupes against static + dynamic at render time;
  // this guard is the server-side belt-and-braces.
  if (items.some((it) => it.url === url)) {
    return c.json({ error: 'this URL is already in the dynamic catalog' }, 409);
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
  if (!kv) return c.json({ error: 'KV_CACHE not bound' }, 503);

  const id = c.req.param('id');
  if (!id || !/^[a-z0-9-]+$/.test(id)) return c.json({ error: 'invalid id' }, 400);

  const items = await readDynamic(kv);
  const next = items.filter((it) => it.id !== id);
  if (next.length === items.length) return c.json({ error: 'not found' }, 404);

  await writeDynamic(kv, next);
  return c.json({ ok: true, deleted: id });
}
