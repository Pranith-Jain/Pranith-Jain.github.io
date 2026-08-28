/**
 * Frameworks manifest — TID-CMM + UTIOM.
 *
 * Reads static JSON shipped in /public/data/frameworks/ via env.ASSETS.
 * Mirrors the threat-intel-manifest pattern (LRU cache, versioned static JSON).
 */

const DATA_PREFIX = '/data/frameworks';

interface BodyCache<T> {
  map: Map<string, T>;
  hits: number;
  misses: number;
}
const MAX_CACHE = 50;
function trackHit<T>(cache: BodyCache<T>, key: string): T | undefined {
  const v = cache.map.get(key);
  if (v === undefined) { cache.misses += 1; return undefined; }
  cache.hits += 1;
  cache.map.delete(key); cache.map.set(key, v);
  return v;
}
function recordHit<T>(cache: BodyCache<T>, key: string, value: T): T {
  if (cache.map.has(key)) cache.map.delete(key);
  cache.map.set(key, value);
  while (cache.map.size > MAX_CACHE) {
    const oldest = cache.map.keys().next().value;
    if (oldest === undefined) break;
    cache.map.delete(oldest);
  }
  return value;
}

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const res = await assets.fetch(new Request(`https://fw.local${path}`));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// ─── TID-CMM types (subsets of /api/model.json) ──────────────────────────
export interface TidCmmModel {
  model: { id: string; version: string; name: string; homepage: string; licence: string; author: string; [k: string]: unknown };
  alignment?: unknown;
  levels: Array<{ value: number; key: string; name: string; summary: string; evidence_bar: string }>;
  scoring: { constraints: Array<{ id: string; name: string; rule: string }>; [k: string]: unknown };
  domains: Array<{
    id: string; name: string; weight: number; intent?: string;
    subcapabilities: Array<{ id: string; name: string; weight: number; profile: string; levels: Record<string, string> }>;
  }>;
}

export interface UtiomManifest {
  framework: string; name: string; version: string; homepage: string; licence: string;
  pillars: Array<{ id: string; name: string; phases: string[] }>;
  phases: Array<{ id: string; name: string; pillar: string; legend: string; mapsTo: string[] }>;
  doctrine: Array<{ n: number; title: string; blurb: string }>;
  [k: string]: unknown;
}

const tidCache: BodyCache<TidCmmModel> = { map: new Map(), hits: 0, misses: 0 };
const utiomCache: BodyCache<UtiomManifest> = { map: new Map(), hits: 0, misses: 0 };
let cachedTidAt: number | null = null;
let cachedUtiomAt: number | null = null;

export async function loadTidCmmModel(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<TidCmmModel> {
  const hit = !opts.forceRefresh ? trackHit(tidCache, 'model') : undefined;
  if (hit) return hit;
  const body = await fetchJson<TidCmmModel>(assets, `${DATA_PREFIX}/tid-cmm/model.json`);
  if (!body) throw new Error(`TID-CMM model not found at ${DATA_PREFIX}/tid-cmm/model.json — run scripts/sync-frameworks.mjs`);
  cachedTidAt = Date.now();
  return recordHit(tidCache, 'model', body);
}

export async function loadUtiomManifest(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<UtiomManifest> {
  const hit = !opts.forceRefresh ? trackHit(utiomCache, 'manifest') : undefined;
  if (hit) return hit;
  const body = await fetchJson<UtiomManifest>(assets, `${DATA_PREFIX}/utiom/manifest.json`);
  if (!body) throw new Error(`UTIOM manifest not found at ${DATA_PREFIX}/utiom/manifest.json`);
  cachedUtiomAt = Date.now();
  return recordHit(utiomCache, 'manifest', body);
}

export function frameworksCacheStats(): Record<string, unknown> {
  return {
    tidCmm: { hits: tidCache.hits, misses: tidCache.misses, size: tidCache.map.size, cachedAt: cachedTidAt },
    utiom: { hits: utiomCache.hits, misses: utiomCache.misses, size: utiomCache.map.size, cachedAt: cachedUtiomAt },
  };
}

export function filterTidDomains(model: TidCmmModel, q?: string): TidCmmModel['domains'] {
  if (!q) return model.domains;
  const needle = q.toLowerCase();
  return model.domains.filter((d) => `${d.id} ${d.name} ${d.intent ?? ''}`.toLowerCase().includes(needle));
}
