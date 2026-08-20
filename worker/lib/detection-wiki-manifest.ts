/**
 * Detection Wiki manifest loader.
 *
 * Reads the static JSON manifest shipped in /public/data/detection-wiki/.
 * Source: https://detection.wiki/ — 15,957 detection rules from Sigma, Elastic,
 * Splunk, Kusto, YARA-L, Panther, Sublime mapped to MITRE ATT&CK, plus
 * hands-on detection labs with KQL queries.
 *
 * Data layout:
 *   /data/detection-wiki/index.json          — slim index + meta
 *   /data/detection-wiki/techniques.json     — ATT&CK matrix (218 techniques)
 *   /data/detection-wiki/platforms.json       — 17 platform catalog entries
 *   /data/detection-wiki/labs.json            — 6 lab index entries
 *   /data/detection-wiki/filters.json         — vendor/platform/status filter metadata
 *
 * In-memory cache: index is small so we keep it forever after first fetch.
 * Bodies cached on demand with a 200-entry LRU.
 */

const DATA_PREFIX = '/data/detection-wiki';

// ── Types ─────────────────────────────────────────────────────────────

export interface DwPlatform {
  name: string;
  slug: string;
  description: string;
  events: number;
  rulesWithSamples: number;
  totalRules?: number;
}

export interface DwTechnique {
  id: string;
  name: string;
  tactic: string;
  ruleCount: number;
  isSubtechnique: boolean;
  parentTechnique?: string;
}

export interface DwTacticColumn {
  tactic: string;
  techniques: DwTechnique[];
  totalRules: number;
}

export interface DwTechniquesIndex {
  generatedAt: string;
  source: string;
  totalRules: number;
  techniqueCount: number;
  subtechniqueCount: number;
  tacticCount: number;
  matrix: DwTacticColumn[];
  all: DwTechnique[];
}

export interface DwLabEntry {
  slug: string;
  title: string;
  author: string;
  date: string;
  description: string;
  techniques: string[];
}

export interface DwLabBody extends DwLabEntry {
  body?: string;
  queries?: string[];
  queryCount?: number;
  sizeBytes?: number;
}

export interface DwFilterVendor {
  name: string;
  count: number;
}

export interface DwFilters {
  vendors: string[];
  vendorCounts: Record<string, number>;
  platforms: string[];
  domains: string[];
  statuses: DwFilterVendor[];
}

export interface DwIndex {
  generatedAt: string;
  source: string;
  description: string;
  stats: {
    totalRules: number;
    eventCount: number;
    techniqueCount: number;
    subtechniqueCount: number;
    platformCount: number;
    labCount: number;
    tacticCount: number;
  };
  platforms: string[];
  vendors: string[];
  topTechniques: DwTechnique[];
}

// ── Cache ─────────────────────────────────────────────────────────────

let cachedIndex: DwIndex | null = null;
let cachedIndexAt = 0;
const INDEX_TTL = 30 * 60 * 1000; // 30 min

let cachedTechniques: DwTechniquesIndex | null = null;
let cachedTechniquesAt = 0;

const labCache = new Map<string, DwLabBody>();
const LAB_CACHE_MAX = 100;

function trackLabHit(key: string): DwLabBody | null {
  const v = labCache.get(key);
  if (v) {
    labCache.delete(key);
    labCache.set(key, v);
  }
  return v ?? null;
}

// ── Helpers ───────────────────────────────────────────────────────────

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  try {
    const res = await assets.fetch(`https://internal${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────

export async function loadDwIndex(assets: Fetcher): Promise<DwIndex> {
  if (cachedIndex && Date.now() - cachedIndexAt < INDEX_TTL) return cachedIndex;
  const idx = await fetchJson<DwIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `Detection Wiki manifest not found at ${DATA_PREFIX}/index.json — ` +
        'did the build run? Run `node scripts/build-detection-wiki.mjs`.'
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export async function loadDwTechniques(assets: Fetcher): Promise<DwTechniquesIndex> {
  if (cachedTechniques && Date.now() - cachedTechniquesAt < INDEX_TTL) return cachedTechniques;
  const data = await fetchJson<DwTechniquesIndex>(assets, `${DATA_PREFIX}/techniques.json`);
  if (!data) {
    throw new Error(`Detection Wiki techniques not found at ${DATA_PREFIX}/techniques.json`);
  }
  cachedTechniques = data;
  cachedTechniquesAt = Date.now();
  return data;
}

export async function loadDwPlatforms(assets: Fetcher): Promise<DwPlatform[]> {
  const data = await fetchJson<DwPlatform[]>(assets, `${DATA_PREFIX}/platforms.json`);
  return data ?? [];
}

export async function loadDwLabs(assets: Fetcher): Promise<DwLabEntry[]> {
  const data = await fetchJson<DwLabEntry[]>(assets, `${DATA_PREFIX}/labs.json`);
  return data ?? [];
}

export async function getDwLab(assets: Fetcher, slug: string): Promise<DwLabBody | null> {
  const key = slug.toLowerCase();
  const hit = trackLabHit(key);
  if (hit) return hit;
  const body = await fetchJson<DwLabBody>(assets, `${DATA_PREFIX}/labs/${key}.json`);
  if (body && labCache.size < LAB_CACHE_MAX) {
    labCache.set(key, body);
  }
  return body;
}

export async function loadDwFilters(assets: Fetcher): Promise<DwFilters | null> {
  return fetchJson<DwFilters>(assets, `${DATA_PREFIX}/filters.json`);
}

// ── Filter helpers ────────────────────────────────────────────────────

export function filterDwTechniques(
  techniques: DwTechnique[],
  opts: { tactic?: string; minRules?: number; q?: string; subtechniques?: boolean } = {}
): DwTechnique[] {
  const { tactic, minRules, q, subtechniques } = opts;
  const query = q?.toLowerCase();
  return techniques.filter((t) => {
    if (subtechniques === false && t.isSubtechnique) return false;
    if (tactic && t.tactic !== tactic) return false;
    if (minRules && t.ruleCount < minRules) return false;
    if (query) {
      const hay = `${t.id} ${t.name} ${t.tactic}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
}

export function dwCacheStats() {
  return {
    index: !!cachedIndex,
    techniques: !!cachedTechniques,
    labs: labCache.size,
  };
}
