/**
 * Hunting Hypothesis Library manifest loader.
 *
 * Reads the static hypothesis manifest shipped in /public/data/hunt-hypotheses/
 * (154 hypotheses across 12 ATT&CK tactics, each with premise + starter
 * queries) through the env.ASSETS binding — no D1, no KV, no public fetch.
 *
 * Shape:
 *   /data/hunt-hypotheses/index.json           (slim index)
 *   /data/hunt-hypotheses/hypotheses/<id>.json (full hypothesis)
 */

export interface HypothesisIndexEntry {
  id: string;
  tactic: string;
  technique: string;
  title: string;
  sizeBytes: number;
}

export interface HuntHypothesesIndex {
  metadata: { description: string; totalHypotheses: number; totalTactics: number };
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  counts: { hypotheses: number; tactics: number };
  tactics: { name: string; count: number }[];
  hypothesisIndex: HypothesisIndexEntry[];
}

export interface HypothesisBody {
  id: string;
  tactic: string;
  technique: string;
  title: string;
  premise: string;
  isTrue: string;
  isFalse: string;
  queries: string[];
  dataSources: string[];
  tags: string[];
}

const DATA_PREFIX = '/data/hunt-hypotheses';
const MAX_BODY_CACHE = 150;

interface BodyCache<T> {
  map: Map<string, T>;
  hits: number;
  misses: number;
}

const hypothesisCache: BodyCache<HypothesisBody> = { map: new Map(), hits: 0, misses: 0 };
let cachedIndex: HuntHypothesesIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://hunt.local${path}`;
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

export async function loadHuntHypothesesIndex(
  assets: Fetcher,
  opts: { forceRefresh?: boolean } = {}
): Promise<HuntHypothesesIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<HuntHypothesesIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `Hunt Hypotheses index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-hunt-hypotheses.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export async function getHuntHypothesis(assets: Fetcher, id: string): Promise<HypothesisBody | null> {
  const hit = trackHit(hypothesisCache, id);
  if (hit) return hit;
  const body = await fetchJson<HypothesisBody>(assets, `${DATA_PREFIX}/hypotheses/${id}.json`);
  if (!body) return null;
  return recordHit(hypothesisCache, id, body);
}

export interface HuntListOptions {
  tactic?: string;
  technique?: string;
  keyword?: string;
  limit?: number;
}

export function filterHuntHypotheses(idx: HuntHypothesesIndex, opts: HuntListOptions = {}): HypothesisIndexEntry[] {
  const { tactic, technique, keyword, limit = 100 } = opts;
  const needle = keyword?.toLowerCase();
  const out: HypothesisIndexEntry[] = [];
  for (const h of idx.hypothesisIndex) {
    if (tactic && h.tactic !== tactic) continue;
    if (technique && h.technique !== technique) continue;
    if (needle) {
      const hay = `${h.id} ${h.tactic} ${h.technique} ${h.title}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

export function huntHypothesesCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
  hypotheses: { size: number; hits: number; misses: number };
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
    hypotheses: { size: hypothesisCache.map.size, hits: hypothesisCache.hits, misses: hypothesisCache.misses },
  };
}

export function _resetHuntCacheForTests(): void {
  hypothesisCache.map.clear();
  hypothesisCache.hits = hypothesisCache.misses = 0;
  cachedIndex = null;
  cachedIndexAt = null;
}
