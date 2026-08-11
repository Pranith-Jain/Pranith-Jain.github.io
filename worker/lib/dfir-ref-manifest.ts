/**
 * DFIR Reference manifest loader.
 *
 * Reads the static JSON manifest shipped in /public/data/dfir-ref/
 * (Windows Event IDs, memory forensics, browser artifacts, evidence
 * collection) through the env.ASSETS binding.
 *
 * Shape:
 *   /data/dfir-ref/index.json
 *   /data/dfir-ref/sections/<category>/<slug>.json
 */

export interface DfirRefCategory {
  key: string;
  name: string;
  count: number;
}

export interface DfirRefIndexEntry {
  slug: string;
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  tags: string[];
  mitre: string | null;
  sizeBytes: number;
}

export interface DfirRefIndex {
  metadata: { description: string; totalItems: number; totalCategories: number };
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  counts: { eventIds: number; memoryCommands: number; browserArtifacts: number; evidencePhases: number };
  categories: DfirRefCategory[];
  itemIndex: DfirRefIndexEntry[];
}

export interface DfirRefItemBody {
  slug: string;
  category: string;
  categoryLabel: string;
  [key: string]: string | number | string[] | null;
}

const DATA_PREFIX = '/data/dfir-ref';
const MAX_BODY_CACHE = 200;

interface BodyCache<T> {
  map: Map<string, T>;
  hits: number;
  misses: number;
}

const bodyCache: BodyCache<DfirRefItemBody> = { map: new Map(), hits: 0, misses: 0 };
let cachedIndex: DfirRefIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://dfirref.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function recordHit<T>(cache: BodyCache<T>, key: string, value: T): T {
  if (cache.map.has(key)) cache.map.delete(key);
  cache.map.set(key, value);
  while (cache.map.size > MAX_BODY_CACHE) {
    const oldest = cache.map.keys().next().value;
    if (oldest === undefined) break;
    cache.map.delete(oldest);
  }
  return value;
}

function trackHit<T>(cache: BodyCache<T>, key: string): T | undefined {
  const v = cache.map.get(key);
  if (v === undefined) {
    cache.misses += 1;
    return undefined;
  }
  cache.hits += 1;
  cache.map.delete(key);
  cache.map.set(key, v);
  return v;
}

export async function loadDfirRefIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<DfirRefIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<DfirRefIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `DFIR Ref index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-dfir-ref.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export async function getDfirRefItem(assets: Fetcher, slug: string): Promise<DfirRefItemBody | null> {
  const hit = trackHit(bodyCache, slug);
  if (hit) return hit;
  const idx = await loadDfirRefIndex(assets);
  const entry = idx.itemIndex.find((e) => e.slug === slug);
  if (!entry) return null;
  const body = await fetchJson<DfirRefItemBody>(assets, `${DATA_PREFIX}/sections/${entry.category}/${slug}.json`);
  if (!body) return null;
  return recordHit(bodyCache, slug, body);
}

export interface DfirRefListOptions {
  category?: string;
  keyword?: string;
  mitre?: string;
  limit?: number;
}

export function filterDfirRefItems(idx: DfirRefIndex, opts: DfirRefListOptions = {}): DfirRefIndexEntry[] {
  const { category, keyword, mitre, limit = 200 } = opts;
  const needle = keyword?.toLowerCase();
  const out: DfirRefIndexEntry[] = [];
  for (const e of idx.itemIndex) {
    if (category && e.category !== category) continue;
    if (mitre && e.mitre !== mitre) continue;
    if (needle) {
      const hay = `${e.name} ${e.id} ${e.categoryLabel} ${e.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function dfirRefCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
  items: { size: number; hits: number; misses: number };
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
    items: { size: bodyCache.map.size, hits: bodyCache.hits, misses: bodyCache.misses },
  };
}

export function _resetDfirRefCacheForTests(): void {
  bodyCache.map.clear();
  bodyCache.hits = bodyCache.misses = 0;
  cachedIndex = null;
  cachedIndexAt = null;
}
