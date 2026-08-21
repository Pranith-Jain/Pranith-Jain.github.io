/**
 * Detection Wiki manifest loader.
 *
 * Reads the static JSON manifest shipped in /public/data/detection-wiki/.
 * Source: https://detection.wiki/ — 15,957 detection rules from Sigma, Elastic,
 * Splunk, Kusto, YARA-L, Panther, Sublime mapped to MITRE ATT&CK, plus
 * hands-on detection labs with KQL queries, Windows provider catalog
 * (103k events across 1,518 providers) and Security-Auditing 426 events.
 *
 * Data layout:
 *   /data/detection-wiki/index.json          — slim index + meta
 *   /data/detection-wiki/techniques.json     — ATT&CK matrix (218 techniques)
 *   /data/detection-wiki/platforms.json       — 17 platform catalog entries
 *   /data/detection-wiki/windows.json        — Windows providers (74 sampled, 1,518 total)
 *   /data/detection-wiki/security-auditing.json — Security-Auditing 426 events
 *   /data/detection-wiki/labs.json            — 6 lab index entries
 *   /data/detection-wiki/labs/<slug>.json     — per-lab bodies with KQL queries
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

export interface DwWindowsProvider {
  name: string;
  slug: string;
  events: number;
  samples: number;
  rules: number;
  channel: string;
}

export interface DwWindowsCatalog {
  generatedAt: string;
  source: string;
  description: string;
  totalProviders: number;
  totalEvents: number;
  providersWithSamples: number;
  providers: DwWindowsProvider[];
}

export interface DwSecurityAuditingEvent {
  id: number;
  title: string;
  channel: string;
  hasSample: boolean;
  hasRule: boolean;
  tactic: string | null;
}

export interface DwSecurityAuditingCatalog {
  generatedAt: string;
  source: string;
  provider: string;
  channel: string;
  eventCount: number;
  sampleCount: number;
  rulesCount: number;
  events: DwSecurityAuditingEvent[];
}

export interface DwPlatformDetail {
  generatedAt: string;
  source: string;
  platform: string;
  slug: string;
  description: string;
  events: number;
  rulesWithSamples: number;
  totalRules: number | null;
  sampleEvents: Array<Record<string, unknown>>;
  sampleCount: number;
  note: string;
}

export interface DwAttackIndex {
  generatedAt: string;
  source: string;
  description: string;
  enterprise: { tactics: string[]; totalTechniques: number; totalTactics: number; totalRules: number };
  tactics: Array<{ tactic: string; totalRules: number; techniqueCount: number; techniques: DwTechnique[] }>;
}

export interface DwAttackTechnique {
  generatedAt: string;
  source: string;
  technique: DwTechnique;
  tactic: string;
  ruleCount: number;
  isSubtechnique: boolean;
  parentTechnique: string | null;
  vendors: string[];
  platforms: string[];
  note: string;
}

export interface DwRulesIndex {
  generatedAt: string;
  source: string;
  totalRules: number;
  sampledRules: number;
  vendors: Record<string, number>;
  platforms: string[];
  rules: Array<{
    id: string;
    title: string;
    vendor: string;
    technique: string;
    tactic: string;
    platform: string;
    status: string;
  }>;
  note: string;
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
    windowsProviders?: number;
    securityAuditingEvents?: number;
    totalWindowsEvents?: number;
    totalWindowsProviders?: number;
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

let cachedWindows: DwWindowsCatalog | null = null;
let cachedWindowsAt = 0;

let cachedSecurityAuditing: DwSecurityAuditingCatalog | null = null;
let cachedSecurityAuditingAt = 0;

let cachedAttack: DwAttackIndex | null = null;
let cachedAttackAt = 0;

let cachedRules: DwRulesIndex | null = null;
let cachedRulesAt = 0;

const labCache = new Map<string, DwLabBody>();
const LAB_CACHE_MAX = 100;

const platformDetailCache = new Map<string, DwPlatformDetail>();
const attackTechniqueCache = new Map<string, DwAttackTechnique>();
const PLATFORM_CACHE_MAX = 50;
const ATTACK_CACHE_MAX = 100;

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

export async function loadDwWindows(assets: Fetcher): Promise<DwWindowsCatalog | null> {
  if (cachedWindows && Date.now() - cachedWindowsAt < 30 * 60 * 1000) return cachedWindows;
  const data = await fetchJson<DwWindowsCatalog>(assets, `${DATA_PREFIX}/windows.json`);
  if (data) {
    cachedWindows = data;
    cachedWindowsAt = Date.now();
  }
  return data;
}

export async function loadDwSecurityAuditing(assets: Fetcher): Promise<DwSecurityAuditingCatalog | null> {
  if (cachedSecurityAuditing && Date.now() - cachedSecurityAuditingAt < 30 * 60 * 1000) return cachedSecurityAuditing;
  const data = await fetchJson<DwSecurityAuditingCatalog>(assets, `${DATA_PREFIX}/security-auditing.json`);
  if (data) {
    cachedSecurityAuditing = data;
    cachedSecurityAuditingAt = Date.now();
  }
  return data;
}

export async function loadDwPlatformDetail(assets: Fetcher, slug: string): Promise<DwPlatformDetail | null> {
  const key = slug.toLowerCase();
  const hit = platformDetailCache.get(key);
  if (hit) {
    platformDetailCache.delete(key);
    platformDetailCache.set(key, hit);
    return hit;
  }
  const body = await fetchJson<DwPlatformDetail>(assets, `${DATA_PREFIX}/platforms-detail/${key}.json`);
  if (body) {
    if (platformDetailCache.size >= PLATFORM_CACHE_MAX) {
      const oldest = platformDetailCache.keys().next().value;
      if (oldest) platformDetailCache.delete(oldest);
    }
    platformDetailCache.set(key, body);
  }
  return body;
}

export async function loadDwAttackIndex(assets: Fetcher): Promise<DwAttackIndex | null> {
  if (cachedAttack && Date.now() - cachedAttackAt < 30 * 60 * 1000) return cachedAttack;
  const data = await fetchJson<DwAttackIndex>(assets, `${DATA_PREFIX}/attack.json`);
  if (data) {
    cachedAttack = data;
    cachedAttackAt = Date.now();
  }
  return data;
}

export async function getDwAttackTechnique(assets: Fetcher, id: string): Promise<DwAttackTechnique | null> {
  const key = id.toLowerCase();
  const hit = attackTechniqueCache.get(key);
  if (hit) {
    attackTechniqueCache.delete(key);
    attackTechniqueCache.set(key, hit);
    return hit;
  }
  const body = await fetchJson<DwAttackTechnique>(assets, `${DATA_PREFIX}/attack/${key}.json`);
  if (body) {
    if (attackTechniqueCache.size >= ATTACK_CACHE_MAX) {
      const oldest = attackTechniqueCache.keys().next().value;
      if (oldest) attackTechniqueCache.delete(oldest);
    }
    attackTechniqueCache.set(key, body);
  }
  return body;
}

export async function loadDwRules(assets: Fetcher): Promise<DwRulesIndex | null> {
  if (cachedRules && Date.now() - cachedRulesAt < 30 * 60 * 1000) return cachedRules;
  const data = await fetchJson<DwRulesIndex>(assets, `${DATA_PREFIX}/rules.json`);
  if (data) {
    cachedRules = data;
    cachedRulesAt = Date.now();
  }
  return data;
}

export async function loadDwFilters(assets: Fetcher): Promise<DwFilters | null> {
  return fetchJson<DwFilters>(assets, `${DATA_PREFIX}/filters.json`);
}

export function filterDwWindowsProviders(
  providers: DwWindowsProvider[],
  opts: { q?: string; minEvents?: number; hasRules?: boolean; limit?: number } = {}
): DwWindowsProvider[] {
  const { q, minEvents, hasRules, limit = 100 } = opts;
  const query = q?.toLowerCase();
  const out: DwWindowsProvider[] = [];
  for (const p of providers) {
    if (minEvents && p.events < minEvents) continue;
    if (hasRules === true && p.rules === 0) continue;
    if (hasRules === false && p.rules > 0) continue;
    if (query) {
      const hay = `${p.name} ${p.slug} ${p.channel}`.toLowerCase();
      if (!hay.includes(query)) continue;
    }
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

export function filterDwSecurityAuditingEvents(
  events: DwSecurityAuditingEvent[],
  opts: { q?: string; hasSample?: boolean; hasRule?: boolean; tactic?: string; limit?: number } = {}
): DwSecurityAuditingEvent[] {
  const { q, hasSample, hasRule, tactic, limit = 200 } = opts;
  const query = q?.toLowerCase();
  const out: DwSecurityAuditingEvent[] = [];
  for (const e of events) {
    if (hasSample !== undefined && e.hasSample !== hasSample) continue;
    if (hasRule !== undefined && e.hasRule !== hasRule) continue;
    if (tactic && e.tactic !== tactic) continue;
    if (query) {
      const hay = `${e.id} ${e.title} ${e.channel} ${e.tactic ?? ''}`.toLowerCase();
      if (!hay.includes(query)) continue;
    }
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
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
    windows: !!cachedWindows,
    securityAuditing: !!cachedSecurityAuditing,
    attack: !!cachedAttack,
    rules: !!cachedRules,
    labs: labCache.size,
    platforms: platformDetailCache.size,
    attackTechniques: attackTechniqueCache.size,
  };
}

export function _resetDwCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = 0;
  cachedTechniques = null;
  cachedTechniquesAt = 0;
  cachedWindows = null;
  cachedWindowsAt = 0;
  cachedSecurityAuditing = null;
  cachedSecurityAuditingAt = 0;
  cachedAttack = null;
  cachedAttackAt = 0;
  cachedRules = null;
  cachedRulesAt = 0;
  labCache.clear();
  platformDetailCache.clear();
  attackTechniqueCache.clear();
}
