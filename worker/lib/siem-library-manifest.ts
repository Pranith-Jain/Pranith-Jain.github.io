/**
 * SIEM Use-Case Library manifest loader.
 *
 * Reads the static detection use-case manifest shipped in
 * /public/data/siem-library/ (60 detection use-cases with KQL + SPL,
 * MITRE ATT&CK mapping, FP guidance and APT attribution) through the
 * env.ASSETS binding — no D1, no KV, no public fetch.
 *
 * Shape:
 *   /data/siem-library/index.json          (slim index)
 *   /data/siem-library/use-cases/<id>.json (full use-case)
 */

export interface SiemUseCaseIndexEntry {
  id: string;
  name: string;
  category: string;
  mitre: string;
  severity: string;
}

export interface SiemLibraryIndex {
  metadata: { description: string; totalUseCases: number; totalCategories: number };
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  counts: { useCases: number; categories: number; techniques: number };
  categories: { name: string; count: number }[];
  severities: Record<string, number>;
  techniques: Record<string, number>;
  useCaseIndex: SiemUseCaseIndexEntry[];
}

export interface SiemUseCaseBody {
  id: string;
  name: string;
  category: string;
  description: string;
  severity: string;
  mitre: string;
  mitreName?: string;
  query: { kql: string; spl?: string; sigma?: string };
  tuning: string;
  falsePositives: string[] | string;
  apt?: string;
  references?: string[];
  tags: string[];
}

const DATA_PREFIX = '/data/siem-library';
const MAX_BODY_CACHE = 120;

interface BodyCache<T> {
  map: Map<string, T>;
  hits: number;
  misses: number;
}

const useCaseCache: BodyCache<SiemUseCaseBody> = { map: new Map(), hits: 0, misses: 0 };
let cachedIndex: SiemLibraryIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://siem.local${path}`;
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

export async function loadSiemLibraryIndex(
  assets: Fetcher,
  opts: { forceRefresh?: boolean } = {}
): Promise<SiemLibraryIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<SiemLibraryIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `SIEM Library index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-siem-library.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export async function getSiemUseCase(assets: Fetcher, id: string): Promise<SiemUseCaseBody | null> {
  const hit = trackHit(useCaseCache, id);
  if (hit) return hit;
  const body = await fetchJson<SiemUseCaseBody>(assets, `${DATA_PREFIX}/use-cases/${id}.json`);
  if (!body) return null;
  return recordHit(useCaseCache, id, body);
}

export interface SiemListOptions {
  category?: string;
  mitre?: string;
  severity?: string;
  keyword?: string;
  limit?: number;
}

export function filterSiemUseCases(idx: SiemLibraryIndex, opts: SiemListOptions = {}): SiemUseCaseIndexEntry[] {
  const { category, mitre, severity, keyword, limit = 100 } = opts;
  const needle = keyword?.toLowerCase();
  const out: SiemUseCaseIndexEntry[] = [];
  for (const u of idx.useCaseIndex) {
    if (category && u.category !== category) continue;
    if (mitre && u.mitre !== mitre) continue;
    if (severity && u.severity !== severity) continue;
    if (needle) {
      const hay = `${u.id} ${u.name} ${u.category} ${u.mitre}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

export function siemLibraryCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
  useCases: { size: number; hits: number; misses: number };
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
    useCases: { size: useCaseCache.map.size, hits: useCaseCache.hits, misses: useCaseCache.misses },
  };
}

export function _resetSiemLibraryCacheForTests(): void {
  useCaseCache.map.clear();
  useCaseCache.hits = useCaseCache.misses = 0;
  cachedIndex = null;
  cachedIndexAt = null;
}
