/**
 * ETDA APT Actors manifest loader.
 *
 * Reads the static JSON manifest shipped in /public/data/apt-actors/.
 * Two sources feed this vertical:
 *   - ETDA Threat Group Cards (504 actors, CC BY-NC-SA 4.0)
 *   - AndreaCristaldi/APTmap (force-directed relationship graph, MIT design ref)
 *
 * Shape:
 *   /data/apt-actors/index.json              (slim index — no bodies)
 *   /data/apt-actors/actors/<slug>.json      (one per actor; showcard data)
 *   /data/apt-actors/aptmap.json             (APTmap graph nodes + links)
 *
 * In-memory cache: index loaded once, bodies cached on demand with 200-entry
 * LRU bound.
 */

export type ActorCategory = 'apt' | 'other' | 'unknown';

export interface ActorIndexEntry {
  slug: string;
  name: string;
  aliases: string[];
  category: ActorCategory;
  country: string | null;
  sponsor: string | null;
  motivation: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  hasDetails: boolean;
  sectorCount: number;
  toolCount: number;
  operationCount: number;
  observedCountries: string[];
  description: string;
  sizeBytes: number;
  mitreId: string | null;
  subgroupCount: number;
}

export interface ActorBody extends ActorIndexEntry {
  names: string[];
  fullDescription: string | null;
  sectors: string[];
  toolsUsed: string[];
  operations: { title: string; url: string | null }[];
  counterOperations: { title: string; url: string | null }[];
  informationLinks: string[];
  mitreLink: string | null;
  subgroups: { name: string; period: string | null }[];
}

export interface AptmapNode {
  id: string;
  name: string;
  description?: string;
  group: string;
  color?: string;
}

export interface AptmapLink {
  source: string;
  target: string;
  color?: string;
}

export interface AptmapGraph {
  nodes: AptmapNode[];
  links: AptmapLink[];
}

export interface ActorIndex {
  source: string;
  license: string;
  replicatedAt: string;
  counts: {
    actors: number;
    apt: number;
    other: number;
    unknown: number;
    withCards: number;
    withMitre: number;
    withTools: number;
    totalSectors: number;
  };
  lastSyncedAt: string;
  lastCardUpdate: string | null;
  actorIndex: ActorIndexEntry[];
  aptmap: {
    nodes: number;
    links: number;
    aptNodes: number;
    countries: number;
    tools: number;
    ttps: number;
  } | null;
}

const DATA_PREFIX = '/data/apt-actors';
const MAX_BODY_CACHE = 200;

interface BodyCache<T> {
  map: Map<string, T>;
  hits: number;
  misses: number;
}

const actorBodyCache: BodyCache<ActorBody> = { map: new Map(), hits: 0, misses: 0 };
let cachedIndex: ActorIndex | null = null;
let cachedIndexAt: number | null = null;
let cachedAptmap: AptmapGraph | null = null;
let cachedAptmapAt: number | null = null;

function safeFilename(slug: string): string {
  return slug.replace(/\//g, '__').replace(/[^A-Za-z0-9._-]/g, '_');
}

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const url = `https://etda.local${path}`;
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

export async function loadActorIndex(
  assets: Fetcher,
  opts: { forceRefresh?: boolean } = {}
): Promise<ActorIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<ActorIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `APT Actors manifest not found at ${DATA_PREFIX}/index.json — ` +
        'did the build run? Run `node scripts/build-etda-actors.mjs`.'
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export async function getActor(
  assets: Fetcher,
  slug: string
): Promise<ActorBody | null> {
  const hit = trackHit(actorBodyCache, slug);
  if (hit) return hit;
  const body = await fetchJson<ActorBody>(
    assets,
    `${DATA_PREFIX}/actors/${safeFilename(slug)}.json`
  );
  if (!body) return null;
  return recordHit(actorBodyCache, slug, body);
}

export async function loadAptmap(
  assets: Fetcher,
  opts: { forceRefresh?: boolean } = {}
): Promise<AptmapGraph | null> {
  if (cachedAptmap && !opts.forceRefresh) return cachedAptmap;
  const graph = await fetchJson<AptmapGraph>(assets, `${DATA_PREFIX}/aptmap.json`);
  if (!graph) return null;
  cachedAptmap = graph;
  cachedAptmapAt = Date.now();
  return graph;
}

// ─── Filter helpers ─────────────────────────────────────────────────────

export interface ActorListOptions {
  category?: ActorCategory;
  country?: string;
  sector?: string;
  hasMitre?: boolean;
  keyword?: string;
  hasTools?: boolean;
  limit?: number;
}

export function filterActors(
  idx: ActorIndex,
  opts: ActorListOptions = {}
): ActorIndexEntry[] {
  const {
    category,
    country,
    sector,
    hasMitre,
    keyword,
    hasTools,
    limit = 100,
  } = opts;
  const needle = keyword?.toLowerCase();
  const countryNeedle = country?.toLowerCase();

  const out: ActorIndexEntry[] = [];
  for (const a of idx.actorIndex) {
    if (category && a.category !== category) continue;
    if (countryNeedle && !(a.country ?? '').toLowerCase().includes(countryNeedle)) continue;
    if (hasMitre && !a.mitreId) continue;
    if (hasTools && a.toolCount === 0) continue;
    if (needle) {
      const hay = `${a.slug} ${a.name} ${a.aliases.join(' ')} ${a.description}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    // Sector filter requires pulling the body — skip for now (index doesn't
    // carry sector list). Use keyword match against description as proxy.
    out.push(a);
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Cache stats ───────────────────────────────────────────────────────

export function actorsCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
  aptmapLoaded: boolean;
  aptmapAgeMs: number | null;
  actors: { size: number; hits: number; misses: number };
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
    aptmapLoaded: cachedAptmap !== null,
    aptmapAgeMs: cachedAptmapAt ? Date.now() - cachedAptmapAt : null,
    actors: {
      size: actorBodyCache.map.size,
      hits: actorBodyCache.hits,
      misses: actorBodyCache.misses,
    },
  };
}

export function _resetEtdaCacheForTests(): void {
  actorBodyCache.map.clear();
  actorBodyCache.hits = actorBodyCache.misses = 0;
  cachedIndex = null;
  cachedIndexAt = null;
  cachedAptmap = null;
  cachedAptmapAt = null;
}