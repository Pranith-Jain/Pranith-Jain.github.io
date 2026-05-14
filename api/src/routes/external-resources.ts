import type { Context } from 'hono';
import type { Env } from '../env';

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
const MAX_ENTRIES = 500;

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

interface AdminEnv extends Env {
  KV_CACHE?: KVNamespace;
  RESOURCES_ADMIN_TOKEN?: string;
}

type AdminCtx = Context<{ Bindings: AdminEnv }>;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function requireAdmin(c: AdminCtx): { error: Response } | { ok: true } {
  const required = c.env.RESOURCES_ADMIN_TOKEN;
  if (!required) {
    return { error: c.json({ error: 'admin endpoint disabled (RESOURCES_ADMIN_TOKEN not set)' }, 403) };
  }
  const authz = c.req.header('authorization') ?? '';
  const headerToken = /^Bearer\s+(.+)$/i.exec(authz)?.[1];
  if (headerToken && safeEqual(headerToken, required)) {
    return { ok: true };
  }
  return {
    error: c.json(
      {
        error: 'unauthorized',
        hint: 'send `Authorization: Bearer <RESOURCES_ADMIN_TOKEN>`',
      },
      401
    ),
  };
}

async function readDynamic(kv: KVNamespace): Promise<ExternalResource[]> {
  const raw = await kv.get(KV_KEY, 'json');
  if (!raw || !Array.isArray(raw)) return [];
  return raw as ExternalResource[];
}

async function writeDynamic(kv: KVNamespace, items: ExternalResource[]): Promise<void> {
  await kv.put(KV_KEY, JSON.stringify(items));
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

export async function listExternalResourcesHandler(c: Context<{ Bindings: AdminEnv }>) {
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

  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

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
