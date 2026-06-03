import type { Context } from 'hono';
import type { Env } from '../env';
import { safeJsonBody } from '../lib/safe-body';

interface ProviderVerdict {
  provider: string;
  verdict: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  score: number;
  category: string;
}

interface ObservableNote {
  id: string;
  text: string;
  created_at: string;
  author: string;
}

interface ObservableEntry {
  id: string;
  indicator: string;
  type: 'ip' | 'domain' | 'url' | 'hash' | 'email' | 'unknown';
  composite_score: number;
  provider_count: number;
  verdicts: ProviderVerdict[];
  tags: string[];
  notes: ObservableNote[];
  tlp: 'white' | 'green' | 'amber' | 'red';
  confidence: number;
  created_at: string;
  updated_at: string;
  last_checked_at: string | null;
}

const KV_KEY = 'observable-db:v2';
const OBS_CACHE_KEY = 'https://observable-db-cache.internal/v2';
const OBS_CACHE_TTL = 30;
const VALID_TLPS = ['white', 'green', 'amber', 'red'] as const;
const VALID_TYPES = ['ip', 'domain', 'url', 'hash', 'email', 'unknown'] as const;
const MAX_ENTRIES = 5000;
const MAX_NOTES_PER_ENTRY = 200;

function cacheApi(): Cache | null {
  try {
    return (caches as unknown as { default: Cache }).default;
  } catch {
    return null;
  }
}

function now(): string {
  return new Date().toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

async function loadAll(kv: KVNamespace): Promise<ObservableEntry[]> {
  const cache = cacheApi();
  if (cache) {
    try {
      const r = await cache.match(OBS_CACHE_KEY);
      if (r) return (await r.json()) as ObservableEntry[];
    } catch {
      /* fall through */
    }
  }
  const raw = await kv.get(KV_KEY, 'json').catch(() => null);
  const entries = (raw as ObservableEntry[]) ?? [];
  if (cache && entries.length > 0) {
    cache
      .put(
        OBS_CACHE_KEY,
        new Response(JSON.stringify(entries), {
          headers: { 'cache-control': `max-age=${OBS_CACHE_TTL}` },
        })
      )
      .catch(() => {});
  }
  return entries;
}

async function saveAll(kv: KVNamespace, entries: ObservableEntry[]): Promise<void> {
  await kv.put(KV_KEY, JSON.stringify(entries));
  const cache = cacheApi();
  if (cache) {
    cache
      .put(
        OBS_CACHE_KEY,
        new Response(JSON.stringify(entries), {
          headers: { 'cache-control': `max-age=${OBS_CACHE_TTL}` },
        })
      )
      .catch(() => {});
  }
}

export async function listObservablesHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const query = c.req.query('q')?.toLowerCase().trim();
  const typeFilter = c.req.query('type');
  const tagFilter = c.req.query('tag');
  const minScore = Number(c.req.query('min_score')) || 0;
  const maxScore = Number(c.req.query('max_score')) || 100;
  const sort = c.req.query('sort') || 'updated_at';
  const order = c.req.query('order') || 'desc';
  const offset = Number(c.req.query('offset')) || 0;
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);

  let entries = await loadAll(kv);

  if (query) {
    entries = entries.filter(
      (e) => e.indicator.toLowerCase().includes(query) || e.tags.some((t) => t.toLowerCase().includes(query))
    );
  }
  if (typeFilter && VALID_TYPES.includes(typeFilter as (typeof VALID_TYPES)[number])) {
    entries = entries.filter((e) => e.type === typeFilter);
  }
  if (tagFilter) {
    entries = entries.filter((e) => e.tags.some((t) => t.toLowerCase() === tagFilter.toLowerCase()));
  }
  entries = entries.filter((e) => e.composite_score >= minScore && e.composite_score <= maxScore);

  entries.sort((a, b) => {
    const aVal = a[sort as keyof ObservableEntry];
    const bVal = b[sort as keyof ObservableEntry];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return order === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });

  const total = entries.length;
  const page = entries.slice(offset, offset + limit);

  return c.json({ entries: page, total, offset, limit }, 200, { 'Cache-Control': 'no-store' });
}

export async function getObservableHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const entries = await loadAll(kv);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return c.json({ error: 'not found' }, 404);

  return c.json({ entry }, 200, { 'Cache-Control': 'no-store' });
}

export async function saveObservableHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const parsed = await safeJsonBody<{
    indicator: string;
    type: ObservableEntry['type'];
    composite_score?: number;
    verdicts?: ProviderVerdict[];
    tags?: string[];
    tlp?: ObservableEntry['tlp'];
    confidence?: number;
  }>(c, { maxBytes: 32 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  if (!body.indicator?.trim() || !body.type) {
    return c.json({ error: 'indicator and type are required' }, 400);
  }

  const now_ = now();
  const entries = await loadAll(kv);

  const existingIdx = entries.findIndex((e) => e.indicator.toLowerCase() === body.indicator.toLowerCase());

  if (existingIdx >= 0) {
    const existing = entries[existingIdx]!;
    existing.updated_at = now_;
    existing.last_checked_at = now_;
    if (body.verdicts) existing.verdicts = body.verdicts;
    if (body.composite_score !== undefined) existing.composite_score = body.composite_score;
    if (body.tags) {
      const tagSet = new Set([...existing.tags, ...body.tags]);
      existing.tags = [...tagSet];
    }
    if (body.tlp && VALID_TLPS.includes(body.tlp)) existing.tlp = body.tlp;
    if (body.confidence !== undefined) existing.confidence = body.confidence;
    existing.provider_count = existing.verdicts.length;
    entries[existingIdx] = existing;
    await saveAll(kv, entries);
    return c.json({ entry: existing, updated: true }, 200);
  }

  const entry: ObservableEntry = {
    id: uuid(),
    indicator: body.indicator.trim(),
    type: body.type,
    composite_score: body.composite_score ?? 0,
    provider_count: body.verdicts?.length ?? 0,
    verdicts: body.verdicts ?? [],
    tags: body.tags ?? [],
    notes: [],
    tlp: body.tlp ?? 'amber',
    confidence: body.confidence ?? 50,
    created_at: now_,
    updated_at: now_,
    last_checked_at: now_,
  };

  if (entries.length >= MAX_ENTRIES) return c.json({ error: 'observable DB is full' }, 507);
  entries.push(entry);
  await saveAll(kv, entries);
  return c.json({ entry, updated: false }, 201);
}

export async function updateObservableHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const parsed = await safeJsonBody<{ tags?: string[]; tlp?: ObservableEntry['tlp']; confidence?: number }>(c, {
    maxBytes: 8 * 1024,
  });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  const entries = await loadAll(kv);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return c.json({ error: 'not found' }, 404);

  const entry = { ...entries[idx]! } as ObservableEntry;
  if (body.tags !== undefined) entry.tags = body.tags;
  if (body.tlp && VALID_TLPS.includes(body.tlp)) entry.tlp = body.tlp;
  if (body.confidence !== undefined) entry.confidence = body.confidence;
  entry.updated_at = now();

  entries[idx] = entry;
  await saveAll(kv, entries);
  return c.json({ entry });
}

export async function deleteObservableHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const entries = await loadAll(kv);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return c.json({ error: 'not found' }, 404);

  entries.splice(idx, 1);
  await saveAll(kv, entries);
  return c.json({ ok: true });
}

export async function addObservableNoteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  if (!id) return c.json({ error: 'id required' }, 400);

  const parsed = await safeJsonBody<{ text: string; author?: string }>(c, { maxBytes: 4 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;

  if (!body.text?.trim()) return c.json({ error: 'text is required' }, 400);

  const entries = await loadAll(kv);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return c.json({ error: 'not found' }, 404);

  const note: ObservableNote = {
    id: uuid(),
    text: body.text.trim(),
    created_at: now(),
    author: body.author ?? 'anonymous',
  };
  const entry = { ...entries[idx]! } as ObservableEntry;
  if (entry.notes.length >= MAX_NOTES_PER_ENTRY)
    return c.json({ error: 'note limit reached for this observable' }, 507);
  entry.notes = [...entry.notes, note];
  entry.updated_at = now();
  entries[idx] = entry;
  await saveAll(kv, entries);
  return c.json({ entry, note }, 201);
}

export async function deleteObservableNoteHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const id = c.req.param('id');
  const noteId = c.req.param('noteId');
  if (!id || !noteId) return c.json({ error: 'id and noteId required' }, 400);

  const entries = await loadAll(kv);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return c.json({ error: 'not found' }, 404);

  const entry = { ...entries[idx]! } as ObservableEntry;
  entry.notes = entry.notes.filter((n) => n.id !== noteId);
  entry.updated_at = now();
  entries[idx] = entry;
  await saveAll(kv, entries);
  return c.json({ entry });
}

export async function getObservableTagsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ error: 'KV not available' }, 503);

  const entries = await loadAll(kv);
  const tagSet = new Set<string>();
  for (const e of entries) {
    for (const t of e.tags) tagSet.add(t);
  }
  const tags = [...tagSet].sort();
  return c.json({ tags }, 200, { 'Cache-Control': 'no-store' });
}
