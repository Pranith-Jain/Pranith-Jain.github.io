/**
 * Webamon Daily Threat Brief manifest loader.
 *
 * Reads the static JSON manifest shipped in /public/data/webamon-dtb/.
 * Source: https://github.com/webamon-org/Daily-Threat-Brief (Apache-2.0)
 *
 * Data layout:
 *   /data/webamon-dtb/index.json           (slim — no bodies)
 *   /data/webamon-dtb/briefs/<date>.json   (one per date)
 *
 * In-memory cache: index is small so we keep it forever after first fetch.
 * Bodies cached on demand with a 50-entry LRU.
 */

export interface WdtbIndexEntry {
  date: string;
  title: string;
  tlp: string;
  kpiCount: number;
  campaignCount: number;
  movementCount: number;
  sizeBytes: number;
}

export interface WdtbIndex {
  source: string;
  license: string;
  generatedAt: string;
  counts: { briefs: number };
  briefs: WdtbIndexEntry[];
}

export interface WdtbKpi {
  value: string;
  label: string;
}

export interface WdtbMovement {
  category: 'growth' | 'takedown' | 'infra-rotation' | 'lure-refresh';
  title: string;
  url: string | null;
  detail: string;
}

export interface WdtbCampaign {
  name: string;
  url: string;
  summary: string;
}

export interface WdtbClusterEntry {
  type: string;
  domains: number;
  growth: number;
  sample: string;
}

export interface WdtbBrief {
  date: string;
  title: string;
  tlp: string;
  estate: {
    campaignsTracked: number;
    uniqueDomains: number;
    percentOnline: number;
  } | null;
  kpis: WdtbKpi[];
  movements: WdtbMovement[];
  campaigns: WdtbCampaign[];
  clusters: {
    summary: { total: number; critical: number; high: number } | null;
    entries: WdtbClusterEntry[];
  };
  sourceUrl: string;
  rawMarkdown: string;
}

const DATA_PREFIX = '/data/webamon-dtb';
const MAX_BODY_CACHE = 50;

interface BodyCache {
  map: Map<string, WdtbBrief>;
  hits: number;
  misses: number;
}

const bodyCache: BodyCache = { map: new Map(), hits: 0, misses: 0 };
let cachedIndex: WdtbIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://wdtb.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function recordHit(key: string, value: WdtbBrief): WdtbBrief {
  if (bodyCache.map.has(key)) bodyCache.map.delete(key);
  bodyCache.map.set(key, value);
  while (bodyCache.map.size > MAX_BODY_CACHE) {
    const oldest = bodyCache.map.keys().next().value;
    if (oldest === undefined) break;
    bodyCache.map.delete(oldest);
  }
  return value;
}

function trackHit(key: string): WdtbBrief | undefined {
  const v = bodyCache.map.get(key);
  if (v === undefined) {
    bodyCache.misses += 1;
    return undefined;
  }
  bodyCache.hits += 1;
  bodyCache.map.delete(key);
  bodyCache.map.set(key, v);
  return v;
}

export async function loadWdtbIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<WdtbIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<WdtbIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `Webamon DTB manifest not found at ${DATA_PREFIX}/index.json — ` +
        'did the build run? Run `node scripts/build-webamon-dtb.mjs`.'
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export async function getWdtbBrief(assets: Fetcher, date: string): Promise<WdtbBrief | null> {
  const hit = trackHit(date);
  if (hit) return hit;
  const body = await fetchJson<WdtbBrief>(assets, `${DATA_PREFIX}/briefs/${date}.json`);
  if (!body) return null;
  return recordHit(date, body);
}

export async function getWdtbLatest(assets: Fetcher): Promise<WdtbBrief | null> {
  const idx = await loadWdtbIndex(assets);
  const latest = idx.briefs[0];
  if (!latest) return null;
  return getWdtbBrief(assets, latest.date);
}

export interface WdtbListOptions {
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  limit?: number;
}

export function filterWdtbBriefs(idx: WdtbIndex, opts: WdtbListOptions = {}): WdtbIndexEntry[] {
  const { dateFrom, dateTo, keyword, limit = 100 } = opts;
  const out: WdtbIndexEntry[] = [];
  for (const b of idx.briefs) {
    if (dateFrom && b.date < dateFrom) continue;
    if (dateTo && b.date > dateTo) continue;
    if (keyword && !b.title.toLowerCase().includes(keyword.toLowerCase())) continue;
    out.push(b);
    if (out.length >= limit) break;
  }
  return out;
}

export function wdtbCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
  bodyCache: { size: number; hits: number; misses: number };
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
    bodyCache: { size: bodyCache.map.size, hits: bodyCache.hits, misses: bodyCache.misses },
  };
}

export function _resetWdtbCacheForTests(): void {
  bodyCache.map.clear();
  bodyCache.hits = bodyCache.misses = 0;
  cachedIndex = null;
  cachedIndexAt = null;
}
