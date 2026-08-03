/**
 * PCMedicalist Intelligence Feed manifest loader.
 *
 * Reads the slim static manifest shipped in /public/data/pcmedicalist/.
 * Source: https://github.com/PCMedicalist/pcmedicalist-intellegence-feed
 * License: CC BY 4.0 (attribution via in-data "source" field satisfies)
 *
 * Data layout:
 *   /data/pcmedicalist/index.json               (slim — no bodies)
 *   /data/pcmedicalist/digests/<date>.json      (slim digest body: summary +
 *                                                posts + top items per layer)
 *
 * The full per-day feed (~4.6 MB) is NOT mirrored; the API proxies it live
 * (see api/src/routes/pcmedicalist.ts deep-dive endpoints).
 *
 * In-memory cache: index is small so we keep it forever after first fetch.
 * Bodies cached on demand with a 50-entry LRU.
 */

export interface PcmLayerCount {
  layer: number;
  name: string;
  count: number;
}

export interface PcmIndexEntry {
  date: string;
  pushedAt: string | null;
  feedsTotal: number | null;
  itemsRaw: number | null;
  itemsDeduped: number | null;
  layerCounts: PcmLayerCount[];
  sizeBytes: number;
}

export interface PcmIndex {
  source: string;
  sourceUrl: string;
  license: string;
  generatedAt: string;
  counts: { digests: number };
  digests: PcmIndexEntry[];
}

export interface PcmItem {
  id: string | null;
  title: string;
  summary: string;
  url: string | null;
  source: string | null;
  category: string | null;
  subcategory: string | null;
  published: string | null;
  severity: string | null;
  trust_score: number | null;
  cves: string[];
  technologies: string[];
  source_type: string | null;
}

export interface PcmLayerBody {
  layer: number;
  name: string;
  trust: number | null;
  count: number;
  top: PcmItem[];
}

export interface PcmDigest {
  date: string;
  feedsTotal: number | null;
  itemsRaw: number | null;
  itemsDeduped: number | null;
  perFeed: Record<string, number>;
  postA: string | null;
  postB: string | null;
  layers: PcmLayerBody[];
  sourceUrl: string;
  upstreamDigestUrl: string;
  rawMarkdownUrl: string;
}

const DATA_PREFIX = '/data/pcmedicalist';
const MAX_BODY_CACHE = 50;

interface BodyCache {
  map: Map<string, PcmDigest>;
  hits: number;
  misses: number;
}

const bodyCache: BodyCache = { map: new Map(), hits: 0, misses: 0 };
let cachedIndex: PcmIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://pcm.local${path}`;
  const res = await assets.fetch(new Request(url));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function recordHit(key: string, value: PcmDigest): PcmDigest {
  if (bodyCache.map.has(key)) bodyCache.map.delete(key);
  bodyCache.map.set(key, value);
  while (bodyCache.map.size > MAX_BODY_CACHE) {
    const oldest = bodyCache.map.keys().next().value;
    if (oldest === undefined) break;
    bodyCache.map.delete(oldest);
  }
  return value;
}

function trackHit(key: string): PcmDigest | undefined {
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

export async function loadPcmIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<PcmIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<PcmIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `PCMedicalist manifest not found at ${DATA_PREFIX}/index.json — ` +
        'did the build run? Run `node scripts/build-pcmedicalist.mjs`.'
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export async function getPcmDigest(assets: Fetcher, date: string): Promise<PcmDigest | null> {
  const hit = trackHit(date);
  if (hit) return hit;
  const body = await fetchJson<PcmDigest>(assets, `${DATA_PREFIX}/digests/${date}.json`);
  if (!body) return null;
  return recordHit(date, body);
}

export async function getPcmLatest(assets: Fetcher): Promise<PcmDigest | null> {
  const idx = await loadPcmIndex(assets);
  const latest = idx.digests[0];
  if (!latest) return null;
  return getPcmDigest(assets, latest.date);
}

export interface PcmListOptions {
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  limit?: number;
}

export function filterPcmDigests(idx: PcmIndex, opts: PcmListOptions = {}): PcmIndexEntry[] {
  const { dateFrom, dateTo, keyword, limit = 100 } = opts;
  const needle = keyword?.toLowerCase();
  const out: PcmIndexEntry[] = [];
  for (const d of idx.digests) {
    if (dateFrom && d.date < dateFrom) continue;
    if (dateTo && d.date > dateTo) continue;
    if (needle) {
      const hay = d.layerCounts
        .map((l) => `${l.name} ${l.count}`)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}

/** Filter an already-loaded digest body's items by layer / keyword / CVE. */
export interface PcmSearchItemsOptions {
  layer?: number;
  keyword?: string;
  cve?: string;
  limit?: number;
}

export function searchPcmItems(digest: PcmDigest, opts: PcmSearchItemsOptions = {}): PcmItem[] {
  const { layer, keyword, cve, limit = 50 } = opts;
  const kwNeedle = keyword?.toLowerCase();
  const cveNeedle = cve?.toUpperCase().replace(/^CVE[-_]?/, '');
  const out: PcmItem[] = [];
  for (const l of digest.layers) {
    if (layer !== undefined && l.layer !== layer) continue;
    for (const item of l.top) {
      if (kwNeedle) {
        const hay = `${item.title} ${item.summary} ${item.source ?? ''} ${item.category ?? ''}`.toLowerCase();
        if (!hay.includes(kwNeedle)) continue;
      }
      if (cveNeedle) {
        const hit = item.cves.some(
          (c) => c.toUpperCase().replace(/^CVE[-_]?/, '') === cveNeedle || c.includes(cveNeedle)
        );
        if (!hit) continue;
      }
      out.push(item);
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

export function pcmCacheStats(): {
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

export function _resetPcmCacheForTests(): void {
  bodyCache.map.clear();
  bodyCache.hits = bodyCache.misses = 0;
  cachedIndex = null;
  cachedIndexAt = null;
}
