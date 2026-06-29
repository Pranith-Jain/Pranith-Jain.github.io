/**
 * Threat Intel manifest loader.
 *
 * Reads the static JSON manifest shipped in /public/data/threat-intel/.
 * Three product sources feed this vertical:
 *   - OpenThreat (NVD + CISA KEV + BSI CERT-Bund ingest, design ref only)
 *   - cyber_threat_intel (sector briefings)
 *   - Daily-Hunt (IOC family catalog, design ref only)
 *
 * Shape (mirrors public/data/si/ exactly so the build + test patterns reuse):
 *   /data/threat-intel/index.json           (~50-80 KB, slim — no bodies)
 *   /data/threat-intel/cves/<CVE-ID>.json   (one per CVE; CVSS, KEV, score)
 *   /data/threat-intel/cves/kev.json        (CISA KEV snapshot)
 *   /data/threat-intel/iocs/<family>.json   (one per ransomware/malware family)
 *   /data/threat-intel/sectors/<name>.json  (Financial/Healthcare/Government brief)
 *
 * In-memory cache: index is small so we keep it forever after first fetch.
 * Bodies cached on demand with a 200-entry LRU bound to stay under the
 * Worker's 128 MB memory cap when many distinct CVEs are requested.
 *
 * IMPORTANT: OpenThreat is AGPL-3.0. We do not vendor or copy its code;
 * the priority scoring here is derived independently from the README.
 */

export type TiSeverity = 'critical' | 'high' | 'medium' | 'low' | 'unknown';

export interface TiCveIndexEntry {
  cveId: string;
  publishedAt: string;
  lastModifiedAt: string;
  cvssV3Score: number | null;
  cvssV3Severity: TiSeverity;
  vendor: string | null;
  product: string | null;
  inKev: boolean;
  inKevSince: string | null;
  priorityScore: number;
  description: string;
  sizeBytes: number;
}

export interface TiKevEntry {
  cveId: string;
  vendor: string;
  product: string;
  name: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
}

export interface TiIocIndexEntry {
  slug: string;
  family: string;
  category: 'ransomware' | 'malware' | 'apt' | 'c2' | 'phishing' | 'stealer' | 'other';
  aliases: string[];
  firstSeen: string | null;
  mitreTechniques: string[];
  indicatorCount: number;
  description: string;
  sizeBytes: number;
}

export interface TiSectorEntry {
  sector: 'financial' | 'healthcare' | 'government';
  title: string;
  generatedAt: string;
  topCount: number;
  preview: string;
  sizeBytes: number;
}

export interface TiIndex {
  source: string;
  license: string;
  replicatedAt: string;
  counts: { cves: number; iocs: number; sectors: number; kevTotal: number };
  lastSyncedAt: string | null;
  cveIndex: TiCveIndexEntry[];
  iocIndex: TiIocIndexEntry[];
  sectors: TiSectorEntry[];
}

export interface TiCveBody extends TiCveIndexEntry {
  cvssVector: string | null;
  cweIds: string[];
  references: { url: string; source: string; tags: string[] }[];
  bsiDescription: string | null;
  llmSummary: string | null;
  llmRecommendedAction: string | null;
}

export interface TiIocBody extends TiIocIndexEntry {
  indicators: { type: string; value: string; firstSeen: string | null; confidence: 'low' | 'medium' | 'high' }[];
  context: string;
  references: string[];
  llmSummary: string | null;
}

export interface TiSectorBody extends TiSectorEntry {
  executiveSummary: string;
  topThreats: {
    cveId?: string;
    iocFamily?: string;
    title: string;
    relevance: 'sector-direct' | 'sector-implied' | 'broadly-critical';
    risk: string;
    recommendedAction: string;
  }[];
}

const DATA_PREFIX = '/data/threat-intel';
const MAX_BODY_CACHE = 200;

interface BodyCache<T> {
  map: Map<string, T>;
  hits: number;
  misses: number;
}

const cveBodyCache: BodyCache<TiCveBody> = { map: new Map(), hits: 0, misses: 0 };
const iocBodyCache: BodyCache<TiIocBody> = { map: new Map(), hits: 0, misses: 0 };
const sectorBodyCache: BodyCache<TiSectorBody> = { map: new Map(), hits: 0, misses: 0 };
let cachedIndex: TiIndex | null = null;
let cachedIndexAt: number | null = null;
let cachedKev: TiKevEntry[] | null = null;
let cachedKevAt: number | null = null;

function safeFilename(slug: string): string {
  return slug.replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '_');
}

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://ti.local${path}`;
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

export async function loadTiIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<TiIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<TiIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `Threat Intel manifest not found at ${DATA_PREFIX}/index.json — ` +
        'did the build run? Run `node scripts/build-threat-intel.mjs`.'
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export async function getTiCve(assets: Fetcher, cveId: string): Promise<TiCveBody | null> {
  const key = cveId.toUpperCase();
  const hit = trackHit(cveBodyCache, key);
  if (hit) return hit;
  const body = await fetchJson<TiCveBody>(assets, `${DATA_PREFIX}/cves/${safeFilename(key)}.json`);
  if (!body) return null;
  return recordHit(cveBodyCache, key, body);
}

export async function getTiIoc(assets: Fetcher, slug: string): Promise<TiIocBody | null> {
  const hit = trackHit(iocBodyCache, slug);
  if (hit) return hit;
  const body = await fetchJson<TiIocBody>(assets, `${DATA_PREFIX}/iocs/${safeFilename(slug)}.json`);
  if (!body) return null;
  return recordHit(iocBodyCache, slug, body);
}

export async function getTiSector(assets: Fetcher, sector: string): Promise<TiSectorBody | null> {
  const key = sector.toLowerCase();
  const hit = trackHit(sectorBodyCache, key);
  if (hit) return hit;
  const body = await fetchJson<TiSectorBody>(assets, `${DATA_PREFIX}/sectors/${safeFilename(key)}.json`);
  if (!body) return null;
  return recordHit(sectorBodyCache, key, body);
}

export async function loadKevSnapshot(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<TiKevEntry[]> {
  if (cachedKev && !opts.forceRefresh) return cachedKev;
  const list = await fetchJson<TiKevEntry[]>(assets, `${DATA_PREFIX}/cves/kev.json`);
  if (!list) return [];
  cachedKev = list;
  cachedKevAt = Date.now();
  return list;
}

// ─── Filter helpers ─────────────────────────────────────────────────────

export interface TiListCvesOptions {
  severity?: TiSeverity;
  kevOnly?: boolean;
  vendor?: string;
  daysBack?: number;
  minPriority?: number;
  keyword?: string;
  limit?: number;
}

export interface TiListIocsOptions {
  category?: TiIocIndexEntry['category'];
  keyword?: string;
  limit?: number;
}

function severityFromScore(score: number | null): TiSeverity {
  if (score === null) return 'unknown';
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score > 0) return 'low';
  return 'unknown';
}

export function filterCves(idx: TiIndex, opts: TiListCvesOptions = {}): TiCveIndexEntry[] {
  const { severity, kevOnly, vendor, daysBack, minPriority, keyword, limit = 100 } = opts;
  const needle = keyword?.toLowerCase();
  const now = Date.now();
  const cutoffMs = daysBack ? daysBack * 86_400_000 : null;
  const vendorNeedle = vendor?.toLowerCase();

  const out: TiCveIndexEntry[] = [];
  for (const c of idx.cveIndex) {
    if (severity && c.cvssV3Severity !== severity) continue;
    if (kevOnly && !c.inKev) continue;
    if (vendorNeedle && !(c.vendor ?? '').toLowerCase().includes(vendorNeedle)) continue;
    if (minPriority !== undefined && c.priorityScore < minPriority) continue;
    if (cutoffMs) {
      const pub = Date.parse(c.publishedAt);
      if (!isNaN(pub) && now - pub > cutoffMs) continue;
    }
    if (needle) {
      const hay = `${c.cveId} ${c.vendor ?? ''} ${c.product ?? ''} ${c.description}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

export function filterIocs(idx: TiIndex, opts: TiListIocsOptions = {}): TiIocIndexEntry[] {
  const { category, keyword, limit = 100 } = opts;
  const needle = keyword?.toLowerCase();
  const out: TiIocIndexEntry[] = [];
  for (const i of idx.iocIndex) {
    if (category && i.category !== category) continue;
    if (needle) {
      const hay = `${i.slug} ${i.family} ${i.aliases.join(' ')} ${i.description}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(i);
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Priority scoring ───────────────────────────────────────────────────

/**
 * Derive a 0-100 priority score from CVSS + KEV status + recency.
 * We intentionally re-derive this from first principles (per the AGPL
 * boundary on OpenThreat) — it's a small formula.
 *
 *   cvss_norm = clamp(cvss / 10, 0, 1)        0-1
 *   kev_boost = 0.35 if inKev else 0          binary jump for "exploited in the wild"
 *   recency   = 1 - days_since_published/365  0-1, drops to 0 at 1 year
 *   score     = round(100 * (0.55 * cvss_norm + kev_boost + 0.10 * recency))
 */
export function computePriorityScore(opts: {
  cvssV3Score: number | null;
  inKev: boolean;
  publishedAt: string;
  nowMs?: number;
}): number {
  const cvssNorm = opts.cvssV3Score === null ? 0 : Math.max(0, Math.min(1, opts.cvssV3Score / 10));
  const kevBoost = opts.inKev ? 0.35 : 0;
  const pub = Date.parse(opts.publishedAt);
  let recency = 0;
  if (!isNaN(pub)) {
    const nowRef = opts.nowMs ?? Date.now();
    const ageDays = (nowRef - pub) / 86_400_000;
    recency = Math.max(0, 1 - ageDays / 365);
  }
  return Math.round(100 * (0.55 * cvssNorm + kevBoost + 0.1 * recency));
}

// ─── Cache stats ───────────────────────────────────────────────────────

export function tiCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
  kevLoaded: boolean;
  kevAgeMs: number | null;
  cves: { size: number; hits: number; misses: number };
  iocs: { size: number; hits: number; misses: number };
  sectors: { size: number; hits: number; misses: number };
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
    kevLoaded: cachedKev !== null,
    kevAgeMs: cachedKevAt ? Date.now() - cachedKevAt : null,
    cves: { size: cveBodyCache.map.size, hits: cveBodyCache.hits, misses: cveBodyCache.misses },
    iocs: { size: iocBodyCache.map.size, hits: iocBodyCache.hits, misses: iocBodyCache.misses },
    sectors: { size: sectorBodyCache.map.size, hits: sectorBodyCache.hits, misses: sectorBodyCache.misses },
  };
}

export function _resetTiCacheForTests(): void {
  cveBodyCache.map.clear();
  iocBodyCache.map.clear();
  sectorBodyCache.map.clear();
  cveBodyCache.hits = cveBodyCache.misses = 0;
  iocBodyCache.hits = iocBodyCache.misses = 0;
  sectorBodyCache.hits = sectorBodyCache.misses = 0;
  cachedIndex = null;
  cachedIndexAt = null;
  cachedKev = null;
  cachedKevAt = null;
}

export { severityFromScore };
