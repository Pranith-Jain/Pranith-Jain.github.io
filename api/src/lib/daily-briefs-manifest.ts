/**
 * Daily Briefs manifest loader.
 *
 * Reads the static JSON manifest shipped in /public/data/daily-briefs/.
 * Three daily intelligence brief types:
 *   - cyber:     OT/ICS Cyber Threat Intelligence
 *   - deepfake:  DeepFake and Generative AI Intelligence
 *   - disaster:  Global Disaster Intelligence
 *
 * Data layout:
 *   /data/daily-briefs/index.json              (slim — no bodies)
 *   /data/daily-briefs/cyber/<date>.json       (one per date)
 *   /data/daily-briefs/deepfake/<date>.json    (one per date)
 *   /data/daily-briefs/disaster/<date>.json    (one per date)
 *
 * In-memory cache: index is small so we keep it forever after first fetch.
 * Bodies cached on demand with a 100-entry LRU.
 */

export type DbBriefType = 'cyber' | 'deepfake' | 'disaster';

export interface DbIndexEntry {
  type: DbBriefType;
  date: string;
  sizeBytes: number;
}

export interface DbIndex {
  source: string;
  license: string;
  generatedAt: string;
  counts: { cyber: number; deepfake: number; disaster: number };
  briefs: DbIndexEntry[];
}

export interface DbCyberBrief {
  type: 'cyber';
  date: string;
  threatLevel: string;
  executiveSummary: string;
  keyFindings: { title: string; summary: string }[];
  dashboard: {
    kpis: { value: string; label: string }[];
    activelyExploited: string[];
    vendors: string[];
    sectors: string[];
  };
  topThreats: { title: string; action: string }[];
  threatActors: { category: string; items: string[] }[];
  cveWatch: { category: string; items: string[] }[];
  events: {
    title: string;
    severity: string;
    text: string;
    chips: string[];
    sources: { url: string; label: string }[];
  }[];
  ttps: { descriptions: string[]; mitreIds: string[] };
  outlook72h: string;
  relatedCves: string[];
  rawMarkdown: string;
}

export interface DbDeepfakeBrief {
  type: 'deepfake';
  date: string;
  riskOutlook: string;
  executiveSummary: string;
  keyFindings: { title: string; summary: string }[];
  incidents: {
    title: string;
    badges: string[];
    fields: Record<string, string>;
    summary: string;
    sources: { url: string; label: string }[];
  }[];
  emergingTrends: string[];
  geographicObservations: string[];
  detectionDevelopments: string[];
  rawMarkdown: string;
}

export interface DbDisasterBrief {
  type: 'disaster';
  date: string;
  overallThreat: string;
  executiveSummary: string;
  dashboard: { kpis: { value: string; label: string }[] };
  topEvents: { title: string; severity: string; text: string; sources: { url: string; label: string }[] }[];
  escalateEvents: { title: string; severity: string; text: string; sources: { url: string; label: string }[] }[];
  monitorEvents: { title: string; severity: string; text: string; sources: { url: string; label: string }[] }[];
  outlook72h: string;
  regionalTrends: string[];
  rawMarkdown: string;
}

export type DbBriefBody = DbCyberBrief | DbDeepfakeBrief | DbDisasterBrief;

const DATA_PREFIX = '/data/daily-briefs';
const MAX_BODY_CACHE = 100;

interface BodyCache<T> {
  map: Map<string, T>;
  hits: number;
  misses: number;
}

const bodyCache: BodyCache<DbBriefBody> = { map: new Map(), hits: 0, misses: 0 };
let cachedIndex: DbIndex | null = null;
let cachedIndexAt: number | null = null;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://db.local${path}`;
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

export async function loadDbIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<DbIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<DbIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `Daily Briefs manifest not found at ${DATA_PREFIX}/index.json — ` +
        'did the build run? Run `node scripts/build-daily-briefs.mjs`.'
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export async function getDbBrief(assets: Fetcher, type: DbBriefType, date: string): Promise<DbBriefBody | null> {
  const key = `${type}:${date}`;
  const hit = trackHit(bodyCache, key);
  if (hit) return hit;
  const body = await fetchJson<DbBriefBody>(assets, `${DATA_PREFIX}/${type}/${date}.json`);
  if (!body) return null;
  return recordHit(bodyCache, key, body);
}

// ─── Filter helpers ─────────────────────────────────────────────────────

export interface DbListOptions {
  type?: DbBriefType;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export function filterBriefs(idx: DbIndex, opts: DbListOptions = {}): DbIndexEntry[] {
  const { type, dateFrom, dateTo, limit = 100 } = opts;
  const out: DbIndexEntry[] = [];
  for (const b of idx.briefs) {
    if (type && b.type !== type) continue;
    if (dateFrom && b.date < dateFrom) continue;
    if (dateTo && b.date > dateTo) continue;
    out.push(b);
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Cache stats ───────────────────────────────────────────────────────

export function dbCacheStats(): {
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

export function _resetDbCacheForTests(): void {
  bodyCache.map.clear();
  bodyCache.hits = bodyCache.misses = 0;
  cachedIndex = null;
  cachedIndexAt = null;
}
