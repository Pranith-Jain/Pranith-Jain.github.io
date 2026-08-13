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
  /** Argus trending hype score (0-100), set only when the CVE appears
   *  in the Argus trending feed. null when no Argus data is available
   *  for this CVE. */
  argusHypeScore: number | null;
  /** Argus trending velocity delta. Positive = gaining attention. */
  argusRising: number | null;
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

export interface TiDetectionListIndexEntry {
  slug: string;
  title: string;
  category: string;
  sourceFile: string;
  valueColumn: string;
  entryCount: number;
  sizeBytes: number;
  description: string;
}

export interface TiDetectionListEntry {
  value: string;
  description?: string;
  tool?: string;
  category?: string;
  severity?: string;
  priority?: string;
  fpRisk?: string;
  link?: string;
  reference?: string;
  regex?: string;
  comment?: string;
  confidence?: string;
  toolType?: string;
  usage?: string;
  detectionType?: string;
  metadata: Record<string, string>;
}

export interface TiDetectionListBody extends TiDetectionListIndexEntry {
  columns: string[];
  entries: TiDetectionListEntry[];
}

// ─── Darknet directory (darknetlist.is) ─────────────────────────────────

export type TiDarknetCategory =
  'markets' | 'search' | 'forums' | 'news' | 'security' | 'communications' | 'crypto' | 'tools' | 'ai';

export interface TiDarknetSiteIndexEntry {
  slug: string;
  name: string;
  dwdId: string | null;
  category: string;
  status: 'up' | 'down' | 'unknown';
  upMirrors: number;
  totalMirrors: number;
  recommended: boolean;
  isOnion: boolean;
  url: string | null;
  onion: string | null;
}

export interface TiDarknetSiteBody extends TiDarknetSiteIndexEntry {
  url: string | null;
  onion: string | null;
  latencyMs: number | null;
  httpCode: string | null;
  pageSize: string | null;
  fingerprint: string | null;
}

export interface TiDarknetCategoryIndexEntry {
  id: string;
  title: string;
  description: string;
  siteCount: number;
  mirrorCount: number;
  upCount: number;
}

export interface TiDarknetCategoryBody extends TiDarknetCategoryIndexEntry {
  sites: TiDarknetSiteBody[];
}

export interface TiDarknetIndex {
  source: string;
  url: string;
  description: string;
  rebuiltAt: string;
  syncedAt: string;
  counts: {
    categories: number;
    sites: number;
    up: number;
    down: number;
    recommended: number;
    onion: number;
  };
  categories: TiDarknetCategoryIndexEntry[];
  sites: TiDarknetSiteIndexEntry[];
}

export interface TiIndex {
  source: string;
  license: string;
  replicatedAt: string;
  counts: { cves: number; iocs: number; sectors: number; kevTotal: number; lists: number };
  lastSyncedAt: string | null;
  cveIndex: TiCveIndexEntry[];
  iocIndex: TiIocIndexEntry[];
  listsIndex: TiDetectionListIndexEntry[];
  sectors: TiSectorEntry[];
  darknet?: TiDarknetIndex;
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

// ─── ThreatCluster feeds (threatcluster.io) ──────────────────────────

export interface TcClusterIndexEntry {
  slug: string;
  title: string;
  pubDate: string | null;
  sourceCount: number | null;
  sizeBytes: number;
}

export interface TcVulnIndexEntry {
  cveId: string;
  title: string;
  pubDate: string | null;
  sizeBytes: number;
}

export interface TcExploitIndexEntry {
  cveId: string;
  title: string;
  pubDate: string | null;
  severity: string | null;
  inKev: boolean;
  sizeBytes: number;
}

export interface TcVictimIndexEntry {
  id: string;
  victim: string;
  group: string | null;
  sector: string | null;
  country: string | null;
  pubDate: string | null;
  sizeBytes: number;
}

export interface TcIocSource {
  source: string;
  url: string;
  pub_date: string | null;
}

export interface TcIoc {
  type: 'domain' | 'ipv4' | 'ipv6' | 'url' | 'email' | 'hash' | string;
  value: string;
  confidence: string;
  reason: string | null;
  first_seen: string | null;
  last_seen: string | null;
  source_count: number;
  sources: TcIocSource[];
}

export interface TcMispEvent {
  uuid: string;
  info: string | null;
  date: string | null;
  analysis: string | null;
  threat_level_id: string | null;
  timestamp: string | null;
  tags: string[];
  orgc: string | null;
}

export interface TcFeedMeta {
  id: string;
  title: string;
  url: string;
  window: string;
}

export interface TcThreatClusterIndex {
  source: string;
  url: string;
  description: string;
  syncedAt: string;
  lastBuildDates: Partial<Record<'clusters' | 'vulnerabilities' | 'exploits' | 'victims' | 'iocs', string | null>>;
  counts: {
    clusters: number;
    vulnerabilities: number;
    exploits: number;
    victims: number;
    iocs: number;
    mispEvents: number;
  };
  feeds: TcFeedMeta[];
  clusters: TcClusterIndexEntry[];
  vulnerabilities: TcVulnIndexEntry[];
  exploits: TcExploitIndexEntry[];
  victims: TcVictimIndexEntry[];
}

export interface TcClusterBody extends TcClusterIndexEntry {
  link: string;
  guid: string;
  categories: string[];
  description: string;
}

export interface TcVulnBody extends TcVulnIndexEntry {
  link: string;
  guid: string;
  description: string;
}

export interface TcExploitBody extends TcExploitIndexEntry {
  link: string;
  guid: string;
  hasExploit: true;
  categories: string[];
  description: string;
}

export interface TcVictimBody extends TcVictimIndexEntry {
  title: string;
  link: string;
  guid: string;
  categories: string[];
  description: string;
}

export interface TcIocsBody {
  source: string;
  url: string;
  generatedAt: string | null;
  syncedAt: string;
  filters: { confidence: string; window_days: number; types: string[] } | null;
  count: number;
  iocs: TcIoc[];
}

export interface TcMispBody {
  source: string;
  url: string;
  syncedAt: string;
  eventCount: number;
  events: TcMispEvent[];
}

// ─── ThreatCluster entity intelligence ────────────────────────────────
//
// Derived entities from ThreatCluster data: threat actors (MISP galaxy
// attribution), ransomware groups + sectors (dark-web victims), malware
// (Daily-Hunt family dictionary matching), and CVEs (feed + cluster text
// regex). Each profile carries first/last seen, mention frequency by day,
// recent activity, and a weighted related-entity graph from record-level
// co-occurrence. Built by scripts/build-tc-entities.mjs.

export type TcEntityType = 'actor' | 'group' | 'malware' | 'cve' | 'sector';

export const TC_ENTITY_TYPES: TcEntityType[] = ['actor', 'group', 'malware', 'cve', 'sector'];

export interface TcEntityIndexEntry {
  type: TcEntityType;
  slug: string;
  name: string;
  aliases: string[];
  mentionCount: number;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface TcEntityIndex {
  source: string;
  url: string;
  description: string;
  builtAt: string;
  counts: Record<TcEntityType, number>;
  entities: Record<TcEntityType, TcEntityIndexEntry[]>;
}

export interface TcEntityRelated {
  type: TcEntityType;
  slug: string;
  name: string;
  weight: number;
}

export interface TcEntityActivity {
  recordType: 'cluster' | 'vulnerability' | 'exploit' | 'victim' | 'mispEvent';
  slug: string;
  title: string;
  pubDate: string | null;
}

export interface TcEntityBody extends TcEntityIndexEntry {
  sources: string[];
  summary: string;
  frequency: { date: string; count: number }[];
  recentActivity: TcEntityActivity[];
  relatedEntities: TcEntityRelated[];
  mitreTechniques: string[];
  victims?: { id: string; victim: string; sector: string | null; country: string | null; pubDate: string | null }[];
  description?: string | null;
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
const listBodyCache: BodyCache<TiDetectionListBody> = { map: new Map(), hits: 0, misses: 0 };
const darknetSiteCache: BodyCache<TiDarknetSiteBody> = { map: new Map(), hits: 0, misses: 0 };
const darknetCategoryCache: BodyCache<TiDarknetCategoryBody> = { map: new Map(), hits: 0, misses: 0 };
const tcClusterCache: BodyCache<TcClusterBody> = { map: new Map(), hits: 0, misses: 0 };
const tcVulnCache: BodyCache<TcVulnBody> = { map: new Map(), hits: 0, misses: 0 };
const tcExploitCache: BodyCache<TcExploitBody> = { map: new Map(), hits: 0, misses: 0 };
const tcVictimCache: BodyCache<TcVictimBody> = { map: new Map(), hits: 0, misses: 0 };
const tcEntityCache: BodyCache<TcEntityBody> = { map: new Map(), hits: 0, misses: 0 };
let cachedIndex: TiIndex | null = null;
let cachedIndexAt: number | null = null;
let cachedKev: TiKevEntry[] | null = null;
let cachedKevAt: number | null = null;
let cachedTcIndex: TcThreatClusterIndex | null = null;
let cachedTcIndexAt: number | null = null;
let cachedTcIocs: TcIocsBody | null = null;
let cachedTcMisp: TcMispBody | null = null;
let cachedTcEntities: TcEntityIndex | null = null;
let cachedTcEntitiesAt: number | null = null;

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

export async function getTiList(assets: Fetcher, slug: string): Promise<TiDetectionListBody | null> {
  const key = slug.toLowerCase();
  const hit = trackHit(listBodyCache, key);
  if (hit) return hit;
  const body = await fetchJson<TiDetectionListBody>(assets, `${DATA_PREFIX}/lists/${safeFilename(key)}.json`);
  if (!body) return null;
  return recordHit(listBodyCache, key, body);
}

// ─── Darknet directory (darknetlist.is) ───────────────────────────────
//
// The darknet directory is a separate manifest tree under
// /data/threat-intel/darknet/. It has its own index + per-category and
// per-site bodies. We load the darknet index lazily (separate from the
// main TiIndex) because it changes every 30 minutes upstream and is
// fetched on a different sync cadence.

let cachedDarknetIndex: TiDarknetIndex | null = null;
let cachedDarknetIndexAt: number | null = null;

export async function loadDarknetIndex(
  assets: Fetcher,
  opts: { forceRefresh?: boolean } = {}
): Promise<TiDarknetIndex> {
  if (cachedDarknetIndex && !opts.forceRefresh) return cachedDarknetIndex;
  const idx = await fetchJson<TiDarknetIndex>(assets, `${DATA_PREFIX}/darknet/index.json`);
  if (!idx) {
    throw new Error(
      `Darknet directory manifest not found at ${DATA_PREFIX}/darknet/index.json — ` +
        'did the build run? Run `node scripts/sync-darknetlist.mjs && node scripts/build-darknetlist.mjs`.'
    );
  }
  cachedDarknetIndex = idx;
  cachedDarknetIndexAt = Date.now();
  return idx;
}

export async function getDarknetSite(assets: Fetcher, slug: string): Promise<TiDarknetSiteBody | null> {
  const key = slug.toLowerCase();
  const hit = trackHit(darknetSiteCache, key);
  if (hit) return hit;
  const body = await fetchJson<TiDarknetSiteBody>(assets, `${DATA_PREFIX}/darknet/sites/${safeFilename(key)}.json`);
  if (!body) return null;
  return recordHit(darknetSiteCache, key, body);
}

export async function getDarknetCategory(assets: Fetcher, category: string): Promise<TiDarknetCategoryBody | null> {
  const key = category.toLowerCase();
  const hit = trackHit(darknetCategoryCache, key);
  if (hit) return hit;
  const body = await fetchJson<TiDarknetCategoryBody>(
    assets,
    `${DATA_PREFIX}/darknet/categories/${safeFilename(key)}.json`
  );
  if (!body) return null;
  return recordHit(darknetCategoryCache, key, body);
}

export async function loadKevSnapshot(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<TiKevEntry[]> {
  if (cachedKev && !opts.forceRefresh) return cachedKev;
  const list = await fetchJson<TiKevEntry[]>(assets, `${DATA_PREFIX}/cves/kev.json`);
  if (!list) return [];
  cachedKev = list;
  cachedKevAt = Date.now();
  return list;
}

// ─── ThreatCluster feeds (threatcluster.io) ───────────────────────────
//
// A separate manifest tree under /data/threat-intel/threatcluster/ with
// its own lazy index: top-50 trending clusters, CVE vulnerability +
// exploit feeds, dark-web ransomware victims, a high-confidence IOC
// blocklist, and a slim MISP event pass-through. Loaded separately from
// the main TiIndex like the darknet directory (different sync cadence +
// upstream refresh).

export async function loadThreatClusterIndex(
  assets: Fetcher,
  opts: { forceRefresh?: boolean } = {}
): Promise<TcThreatClusterIndex> {
  if (cachedTcIndex && !opts.forceRefresh) return cachedTcIndex;
  const idx = await fetchJson<TcThreatClusterIndex>(assets, `${DATA_PREFIX}/threatcluster/index.json`);
  if (!idx) {
    throw new Error(
      `ThreatCluster manifest not found at ${DATA_PREFIX}/threatcluster/index.json — ` +
        'did the build run? Run `node scripts/sync-threatcluster.mjs && node scripts/build-threatcluster.mjs`.'
    );
  }
  cachedTcIndex = idx;
  cachedTcIndexAt = Date.now();
  return idx;
}

export async function getTcCluster(assets: Fetcher, slug: string): Promise<TcClusterBody | null> {
  const key = slug.toLowerCase();
  const hit = trackHit(tcClusterCache, key);
  if (hit) return hit;
  const body = await fetchJson<TcClusterBody>(
    assets,
    `${DATA_PREFIX}/threatcluster/clusters/${safeFilename(key)}.json`
  );
  if (!body) return null;
  return recordHit(tcClusterCache, key, body);
}

export async function getTcVuln(assets: Fetcher, cveId: string): Promise<TcVulnBody | null> {
  const key = cveId.toUpperCase();
  const hit = trackHit(tcVulnCache, key);
  if (hit) return hit;
  const body = await fetchJson<TcVulnBody>(
    assets,
    `${DATA_PREFIX}/threatcluster/vulnerabilities/${safeFilename(key)}.json`
  );
  if (!body) return null;
  return recordHit(tcVulnCache, key, body);
}

export async function getTcExploit(assets: Fetcher, cveId: string): Promise<TcExploitBody | null> {
  const key = cveId.toUpperCase();
  const hit = trackHit(tcExploitCache, key);
  if (hit) return hit;
  const body = await fetchJson<TcExploitBody>(
    assets,
    `${DATA_PREFIX}/threatcluster/exploits/${safeFilename(key)}.json`
  );
  if (!body) return null;
  return recordHit(tcExploitCache, key, body);
}

export async function getTcVictim(assets: Fetcher, id: string): Promise<TcVictimBody | null> {
  const key = id.toLowerCase();
  const hit = trackHit(tcVictimCache, key);
  if (hit) return hit;
  const body = await fetchJson<TcVictimBody>(assets, `${DATA_PREFIX}/threatcluster/victims/${safeFilename(key)}.json`);
  if (!body) return null;
  return recordHit(tcVictimCache, key, body);
}

export async function loadTcIocs(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<TcIocsBody | null> {
  if (cachedTcIocs && !opts.forceRefresh) return cachedTcIocs;
  const body = await fetchJson<TcIocsBody>(assets, `${DATA_PREFIX}/threatcluster/iocs.json`);
  if (!body) return null;
  cachedTcIocs = body;
  return body;
}

export async function loadTcMispEvents(
  assets: Fetcher,
  opts: { forceRefresh?: boolean } = {}
): Promise<TcMispBody | null> {
  if (cachedTcMisp && !opts.forceRefresh) return cachedTcMisp;
  const body = await fetchJson<TcMispBody>(assets, `${DATA_PREFIX}/threatcluster/misp.json`);
  if (!body) return null;
  cachedTcMisp = body;
  return body;
}

export async function loadTcEntities(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<TcEntityIndex> {
  if (cachedTcEntities && !opts.forceRefresh) return cachedTcEntities;
  const idx = await fetchJson<TcEntityIndex>(assets, `${DATA_PREFIX}/threatcluster/entities/index.json`);
  if (!idx) {
    throw new Error(
      `ThreatCluster entity manifest not found at ${DATA_PREFIX}/threatcluster/entities/index.json — ` +
        'did the build run? Run `node scripts/build-tc-entities.mjs`.'
    );
  }
  cachedTcEntities = idx;
  cachedTcEntitiesAt = Date.now();
  return idx;
}

export async function getTcEntity(assets: Fetcher, type: TcEntityType, slug: string): Promise<TcEntityBody | null> {
  const key = `${type}/${slug.toLowerCase()}`;
  const hit = trackHit(tcEntityCache, key);
  if (hit) return hit;
  const body = await fetchJson<TcEntityBody>(
    assets,
    `${DATA_PREFIX}/threatcluster/entities/${type}/${safeFilename(slug.toLowerCase())}.json`
  );
  if (!body) return null;
  return recordHit(tcEntityCache, key, body);
}

export function getTcEntityTypeOrNull(raw: string | undefined): TcEntityType | null {
  if (!raw) return null;
  const t = raw.toLowerCase() as TcEntityType;
  return TC_ENTITY_TYPES.includes(t) ? t : null;
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
  /** Only return CVEs whose Argus hype score is >= this value (0-100).
   *  CVEs without Argus data are excluded when this filter is active. */
  minArgusScore?: number;
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
  const { severity, kevOnly, vendor, daysBack, minPriority, keyword, minArgusScore, limit = 100 } = opts;
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
    if (minArgusScore !== undefined) {
      if (c.argusHypeScore === null || c.argusHypeScore < minArgusScore) continue;
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

export interface TiListListsOptions {
  category?: string;
  keyword?: string;
  limit?: number;
}

export function filterLists(idx: TiIndex, opts: TiListListsOptions = {}): TiDetectionListIndexEntry[] {
  const { category, keyword, limit = 100 } = opts;
  const needle = keyword?.toLowerCase();
  const out: TiDetectionListIndexEntry[] = [];
  for (const l of idx.listsIndex ?? []) {
    if (category && l.category !== category) continue;
    if (needle) {
      const hay = `${l.slug} ${l.title} ${l.description}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(l);
    if (out.length >= limit) break;
  }
  return out;
}

export interface TiSearchListEntriesOptions {
  keyword?: string;
  severity?: string;
  limit?: number;
}

export function searchListEntries(
  body: TiDetectionListBody,
  opts: TiSearchListEntriesOptions = {}
): TiDetectionListEntry[] {
  const { keyword, severity, limit = 500 } = opts;
  const needle = keyword?.toLowerCase();
  const sevNeedle = severity?.toLowerCase();
  const out: TiDetectionListEntry[] = [];
  for (const e of body.entries) {
    if (sevNeedle && (e.severity ?? '').toLowerCase() !== sevNeedle) continue;
    if (needle) {
      const hay = `${e.value} ${e.description ?? ''} ${e.tool ?? ''} ${e.category ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Darknet directory filter helpers ─────────────────────────────────

export interface TiListDarknetOptions {
  category?: string;
  status?: 'up' | 'down';
  recommendedOnly?: boolean;
  onionOnly?: boolean;
  keyword?: string;
  limit?: number;
}

export function filterDarknetSites(idx: TiDarknetIndex, opts: TiListDarknetOptions = {}): TiDarknetSiteIndexEntry[] {
  const { category, status, recommendedOnly, onionOnly, keyword, limit = 200 } = opts;
  const needle = keyword?.toLowerCase();
  const out: TiDarknetSiteIndexEntry[] = [];
  for (const s of idx.sites) {
    if (category && s.category !== category) continue;
    if (status && s.status !== status) continue;
    if (recommendedOnly && !s.recommended) continue;
    if (onionOnly && !s.isOnion) continue;
    if (needle) {
      const hay = `${s.name} ${s.dwdId ?? ''} ${s.category}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

// ─── ThreatCluster filter helpers ──────────────────────────────────────

export interface TcListClustersOptions {
  keyword?: string;
  limit?: number;
}

export interface TcListVulnsOptions {
  keyword?: string;
  limit?: number;
}

export interface TcListExploitsOptions {
  severity?: string;
  kevOnly?: boolean;
  keyword?: string;
  limit?: number;
}

export interface TcListVictimsOptions {
  group?: string;
  sector?: string;
  country?: string;
  keyword?: string;
  limit?: number;
}

export interface TcListIocsOptions {
  type?: string;
  keyword?: string;
  limit?: number;
}

export function filterTcClusters(idx: TcThreatClusterIndex, opts: TcListClustersOptions = {}): TcClusterIndexEntry[] {
  const { keyword, limit = 100 } = opts;
  const needle = keyword?.toLowerCase();
  const out: TcClusterIndexEntry[] = [];
  for (const c of idx.clusters) {
    if (needle && !`${c.title} ${c.slug}`.toLowerCase().includes(needle)) continue;
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

export function filterTcVulns(idx: TcThreatClusterIndex, opts: TcListVulnsOptions = {}): TcVulnIndexEntry[] {
  const { keyword, limit = 100 } = opts;
  const needle = keyword?.toLowerCase();
  const out: TcVulnIndexEntry[] = [];
  for (const v of idx.vulnerabilities) {
    if (needle && !`${v.cveId} ${v.title}`.toLowerCase().includes(needle)) continue;
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

export function filterTcExploits(idx: TcThreatClusterIndex, opts: TcListExploitsOptions = {}): TcExploitIndexEntry[] {
  const { severity, kevOnly, keyword, limit = 100 } = opts;
  const needle = keyword?.toLowerCase();
  const sevNeedle = severity?.toUpperCase();
  const out: TcExploitIndexEntry[] = [];
  for (const e of idx.exploits) {
    if (sevNeedle && e.severity !== sevNeedle) continue;
    if (kevOnly && !e.inKev) continue;
    if (needle && !`${e.cveId} ${e.title}`.toLowerCase().includes(needle)) continue;
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function filterTcVictims(idx: TcThreatClusterIndex, opts: TcListVictimsOptions = {}): TcVictimIndexEntry[] {
  const { group, sector, country, keyword, limit = 100 } = opts;
  const needle = keyword?.toLowerCase();
  const out: TcVictimIndexEntry[] = [];
  for (const v of idx.victims) {
    if (group && (v.group ?? '').toLowerCase() !== group.toLowerCase()) continue;
    if (sector && (v.sector ?? '').toLowerCase() !== sector.toLowerCase()) continue;
    if (country && (v.country ?? '').toLowerCase() !== country.toLowerCase()) continue;
    if (needle) {
      const hay = `${v.victim} ${v.group ?? ''} ${v.sector ?? ''} ${v.country ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}

export function filterTcIocs(iocs: TcIoc[], opts: TcListIocsOptions = {}): TcIoc[] {
  const { type, keyword, limit = 200 } = opts;
  const needle = keyword?.toLowerCase();
  const out: TcIoc[] = [];
  for (const i of iocs) {
    if (type && i.type !== type) continue;
    if (needle) {
      const hay = `${i.value} ${i.reason ?? ''} ${i.sources.map((s) => s.source).join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(i);
    if (out.length >= limit) break;
  }
  return out;
}

export interface TcListEntitiesOptions {
  type?: TcEntityType;
  keyword?: string;
  minMentions?: number;
  limit?: number;
}

/** Filter the entity index. With no `type` all five entity types are searched. */
export function filterTcEntities(idx: TcEntityIndex, opts: TcListEntitiesOptions = {}): TcEntityIndexEntry[] {
  const { type, keyword, minMentions, limit = 100 } = opts;
  const needle = keyword?.toLowerCase();
  const out: TcEntityIndexEntry[] = [];
  const types = type ? [type] : TC_ENTITY_TYPES;
  for (const t of types) {
    for (const e of idx.entities[t] ?? []) {
      if (minMentions !== undefined && e.mentionCount < minMentions) continue;
      if (needle) {
        const hay = `${e.name} ${e.aliases.join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      out.push(e);
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Priority scoring ───────────────────────────────────────────────────

/**
 * Derive a 0-100 priority score from CVSS + KEV status + recency + (optional) Argus hype.
 * We intentionally re-derive this from first principles (per the AGPL
 * boundary on OpenThreat) — it's a small formula.
 *
 * Without Argus:
 *   cvss_norm = clamp(cvss / 10, 0, 1)        0-1
 *   kev_boost = 0.35 if inKev else 0
 *   recency   = 1 - days_since_published/365  0-1, drops to 0 at 1 year
 *   score     = round(100 * (0.55 * cvss_norm + kev_boost + 0.10 * recency))
 *
 * With Argus hypeScore (0-100), the CVSS weight shifts to 0.40 and
 * argus_norm = clamp(hypeScore / 100, 0, 1) gets a 0.15 weight:
 *   score     = round(100 * (0.40 * cvss_norm + kev_boost + 0.10 * recency + 0.15 * argus_norm))
 * Total weight always sums to ≤ 1.0, keeping the max at 100.
 */
export function computePriorityScore(opts: {
  cvssV3Score: number | null;
  inKev: boolean;
  publishedAt: string;
  nowMs?: number;
  /** Argus hype score (0-100). When provided, shifts CVSS weight and adds
   *  a trending-signal factor. Pass null to use the original formula. */
  argusHypeScore?: number | null;
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
  const hasArgus = opts.argusHypeScore != null;
  const argusNorm = hasArgus ? Math.max(0, Math.min(1, opts.argusHypeScore! / 100)) : 0;
  const cvssWeight = hasArgus ? 0.4 : 0.55;
  return Math.round(100 * (cvssWeight * cvssNorm + kevBoost + 0.1 * recency + (hasArgus ? 0.15 * argusNorm : 0)));
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
  lists: { size: number; hits: number; misses: number };
  darknet: {
    indexLoaded: boolean;
    indexAgeMs: number | null;
    sites: { size: number; hits: number; misses: number };
    categories: { size: number; hits: number; misses: number };
  };
  threatcluster: {
    indexLoaded: boolean;
    indexAgeMs: number | null;
    clusters: { size: number; hits: number; misses: number };
    vulnerabilities: { size: number; hits: number; misses: number };
    exploits: { size: number; hits: number; misses: number };
    victims: { size: number; hits: number; misses: number };
    entities: {
      indexLoaded: boolean;
      indexAgeMs: number | null;
      bodies: { size: number; hits: number; misses: number };
    };
  };
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
    kevLoaded: cachedKev !== null,
    kevAgeMs: cachedKevAt ? Date.now() - cachedKevAt : null,
    cves: { size: cveBodyCache.map.size, hits: cveBodyCache.hits, misses: cveBodyCache.misses },
    iocs: { size: iocBodyCache.map.size, hits: iocBodyCache.hits, misses: iocBodyCache.misses },
    sectors: { size: sectorBodyCache.map.size, hits: sectorBodyCache.hits, misses: sectorBodyCache.misses },
    lists: { size: listBodyCache.map.size, hits: listBodyCache.hits, misses: listBodyCache.misses },
    darknet: {
      indexLoaded: cachedDarknetIndex !== null,
      indexAgeMs: cachedDarknetIndexAt ? Date.now() - cachedDarknetIndexAt : null,
      sites: { size: darknetSiteCache.map.size, hits: darknetSiteCache.hits, misses: darknetSiteCache.misses },
      categories: {
        size: darknetCategoryCache.map.size,
        hits: darknetCategoryCache.hits,
        misses: darknetCategoryCache.misses,
      },
    },
    threatcluster: {
      indexLoaded: cachedTcIndex !== null,
      indexAgeMs: cachedTcIndexAt ? Date.now() - cachedTcIndexAt : null,
      clusters: { size: tcClusterCache.map.size, hits: tcClusterCache.hits, misses: tcClusterCache.misses },
      vulnerabilities: { size: tcVulnCache.map.size, hits: tcVulnCache.hits, misses: tcVulnCache.misses },
      exploits: { size: tcExploitCache.map.size, hits: tcExploitCache.hits, misses: tcExploitCache.misses },
      victims: { size: tcVictimCache.map.size, hits: tcVictimCache.hits, misses: tcVictimCache.misses },
      entities: {
        indexLoaded: cachedTcEntities !== null,
        indexAgeMs: cachedTcEntitiesAt ? Date.now() - cachedTcEntitiesAt : null,
        bodies: { size: tcEntityCache.map.size, hits: tcEntityCache.hits, misses: tcEntityCache.misses },
      },
    },
  };
}

export function _resetTiCacheForTests(): void {
  cveBodyCache.map.clear();
  iocBodyCache.map.clear();
  sectorBodyCache.map.clear();
  listBodyCache.map.clear();
  darknetSiteCache.map.clear();
  darknetCategoryCache.map.clear();
  cveBodyCache.hits = cveBodyCache.misses = 0;
  iocBodyCache.hits = iocBodyCache.misses = 0;
  sectorBodyCache.hits = sectorBodyCache.misses = 0;
  listBodyCache.hits = listBodyCache.misses = 0;
  darknetSiteCache.hits = darknetSiteCache.misses = 0;
  darknetCategoryCache.hits = darknetCategoryCache.misses = 0;
  cachedIndex = null;
  cachedIndexAt = null;
  cachedKev = null;
  cachedKevAt = null;
  cachedDarknetIndex = null;
  cachedDarknetIndexAt = null;
  tcClusterCache.map.clear();
  tcVulnCache.map.clear();
  tcExploitCache.map.clear();
  tcVictimCache.map.clear();
  tcEntityCache.map.clear();
  tcClusterCache.hits = tcClusterCache.misses = 0;
  tcVulnCache.hits = tcVulnCache.misses = 0;
  tcExploitCache.hits = tcExploitCache.misses = 0;
  tcVictimCache.hits = tcVictimCache.misses = 0;
  tcEntityCache.hits = tcEntityCache.misses = 0;
  cachedTcIndex = null;
  cachedTcIndexAt = null;
  cachedTcIocs = null;
  cachedTcMisp = null;
  cachedTcEntities = null;
  cachedTcEntitiesAt = null;
}

export { severityFromScore };
