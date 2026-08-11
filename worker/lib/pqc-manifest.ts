/**
 * Post-Quantum Cryptography manifest loader.
 *
 * Reads the static PQC reference manifest shipped in /public/data/pqc/
 * (NIST FIPS 203/204/205/206 algorithms, HNDL threat model, crypto class
 * risk table, readiness assessment) through the env.ASSETS binding — no
 * D1, no KV, no public fetch.
 *
 * Shape:
 *   /data/pqc/index.json                (slim index + classes + readiness)
 *   /data/pqc/algorithms/<slug>.json    (full algorithm reference)
 */

export interface PqcAlgorithmIndexEntry {
  slug: string;
  name: string;
  fips: string;
  type: 'KEM' | 'Signature';
  status: string;
}

export interface PqcIndex {
  metadata: { description: string; totalAlgorithms: number; totalReadiness: number; totalCryptoClasses: number };
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  counts: { algorithms: number; readiness: number; cryptoClasses: number };
  algorithmIndex: PqcAlgorithmIndexEntry[];
  models: string[];
  hndl: { title: string; description: string; summary: string };
  cryptoClasses: { id: string; name: string; risk: string; migration: string }[];
  readiness: { id: string; question: string; why: string }[];
}

export interface PqcAlgorithmBody {
  slug: string;
  name: string;
  fips: string;
  type: 'KEM' | 'Signature';
  status: string;
  class: string;
  keySizes: string;
  description: string;
  uses: string[];
  migration: string;
  rfc?: string;
}

const DATA_PREFIX = '/data/pqc';
const MAX_BODY_CACHE = 20;

interface BodyCache<T> {
  map: Map<string, T>;
  hits: number;
  misses: number;
}

const algorithmCache: BodyCache<PqcAlgorithmBody> = { map: new Map(), hits: 0, misses: 0 };
let cachedIndex: PqcIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://pqc.local${path}`;
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

export async function loadPqcIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<PqcIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<PqcIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(`PQC index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-pqc.mjs' first.`);
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export async function getPqcAlgorithm(assets: Fetcher, slug: string): Promise<PqcAlgorithmBody | null> {
  const hit = trackHit(algorithmCache, slug);
  if (hit) return hit;
  const body = await fetchJson<PqcAlgorithmBody>(assets, `${DATA_PREFIX}/algorithms/${slug}.json`);
  if (!body) return null;
  return recordHit(algorithmCache, slug, body);
}

export function pqcCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
  algorithms: { size: number; hits: number; misses: number };
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
    algorithms: { size: algorithmCache.map.size, hits: algorithmCache.hits, misses: algorithmCache.misses },
  };
}

export function _resetPqcCacheForTests(): void {
  algorithmCache.map.clear();
  algorithmCache.hits = algorithmCache.misses = 0;
  cachedIndex = null;
  cachedIndexAt = null;
}
