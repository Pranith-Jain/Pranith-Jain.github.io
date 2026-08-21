/**
 * Threat Monitor manifest loader — Global Threat Actor Monitor replication.
 *
 * Source: https://github.com/hero-itsme/Global-Threat-Actor-Monitor (MIT)
 *   - 40 APT groups + 148 aliases (expanded to 65 locally)
 *   - 29 curated ATT&CK techniques -> Kill Chain (expanded to 47+)
 *   - 30 OSINT RSS/Atom feeds polled every 10 min (expanded to 42)
 *
 * Data ships in /public/data/threat-monitor/ via ASSETS:
 *   /data/threat-monitor/index.json      — slim index + stats + architecture
 *   /data/threat-monitor/groups.json     — 81 groups with aliases, mitre_id, origin, sectors, upstream flag
 *   /data/threat-monitor/techniques.json — 108 techniques with kill_chain + keywords
 *   /data/threat-monitor/sources.json    — 39 sources with category + upstream flag
 *   /data/threat-monitor/groups/<slug>.json — per-group body
 */

const DATA_PREFIX = '/data/threat-monitor';

export interface TamGroup {
  name: string;
  mitre_id: string | null;
  aliases: string[];
  aliasCount: number;
  suspected_origin: string;
  target_sectors: string[];
  isUpstream: boolean;
}

export interface TamTechnique {
  id: string;
  name: string;
  tactic: string;
  kill_chain: string;
  keywords: string[];
  keywordCount: number;
}

export interface TamSource {
  name: string;
  url: string;
  category: string;
  isUpstream: boolean;
}

export interface TamIndex {
  generatedAt: string;
  source: string;
  license: string;
  description: string;
  upstream: { groups: number; aliases: number; techniques: number; sources: number; killChainStages: number };
  expanded: { groups: number; aliases: number; techniques: number; sources: number };
  architecture: Record<string, string>;
  files: string[];
  stats: { totalGroups: number; totalTechniques: number; totalSources: number; killChainStages: number };
}

export interface TamGroupsFile {
  generatedAt: string;
  source: string;
  description: string;
  totalGroups: number;
  upstreamGroups: number;
  expandedGroups: number;
  aliasCount: number;
  groups: TamGroup[];
}

export interface TamTechniquesFile {
  generatedAt: string;
  source: string;
  description: string;
  totalTechniques: number;
  upstreamTechniques: number;
  expandedTechniques: number;
  killChainStages: string[];
  tacticToKillChain: Record<string, string>;
  techniques: TamTechnique[];
}

export interface TamSourcesFile {
  generatedAt: string;
  source: string;
  description: string;
  totalSources: number;
  upstreamSources: number;
  expandedSources: number;
  categories: string[];
  sources: TamSource[];
}

let cachedIndex: TamIndex | null = null;
let cachedIndexAt = 0;
let cachedGroups: TamGroupsFile | null = null;
let cachedGroupsAt = 0;
let cachedTechniques: TamTechniquesFile | null = null;
let cachedTechniquesAt = 0;
let cachedSources: TamSourcesFile | null = null;
let cachedSourcesAt = 0;

const groupBodyCache = new Map<string, TamGroup>();
const GROUP_CACHE_MAX = 100;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  try {
    const res = await assets.fetch(`https://internal${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function loadTamIndex(assets: Fetcher): Promise<TamIndex> {
  if (cachedIndex && Date.now() - cachedIndexAt < 30 * 60 * 1000) return cachedIndex;
  const data = await fetchJson<TamIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!data) throw new Error(`Threat-monitor index not found at ${DATA_PREFIX}/index.json`);
  cachedIndex = data;
  cachedIndexAt = Date.now();
  return data;
}

export async function loadTamGroups(assets: Fetcher): Promise<TamGroupsFile> {
  if (cachedGroups && Date.now() - cachedGroupsAt < 30 * 60 * 1000) return cachedGroups;
  const data = await fetchJson<TamGroupsFile>(assets, `${DATA_PREFIX}/groups.json`);
  if (!data) throw new Error(`Threat-monitor groups not found at ${DATA_PREFIX}/groups.json`);
  cachedGroups = data;
  cachedGroupsAt = Date.now();
  return data;
}

export async function loadTamTechniques(assets: Fetcher): Promise<TamTechniquesFile> {
  if (cachedTechniques && Date.now() - cachedTechniquesAt < 30 * 60 * 1000) return cachedTechniques;
  const data = await fetchJson<TamTechniquesFile>(assets, `${DATA_PREFIX}/techniques.json`);
  if (!data) throw new Error(`Threat-monitor techniques not found at ${DATA_PREFIX}/techniques.json`);
  cachedTechniques = data;
  cachedTechniquesAt = Date.now();
  return data;
}

export async function loadTamSources(assets: Fetcher): Promise<TamSourcesFile> {
  if (cachedSources && Date.now() - cachedSourcesAt < 30 * 60 * 1000) return cachedSources;
  const data = await fetchJson<TamSourcesFile>(assets, `${DATA_PREFIX}/sources.json`);
  if (!data) throw new Error(`Threat-monitor sources not found at ${DATA_PREFIX}/sources.json`);
  cachedSources = data;
  cachedSourcesAt = Date.now();
  return data;
}

export async function getTamGroup(assets: Fetcher, slug: string): Promise<TamGroup | null> {
  const key = slug.toLowerCase();
  const hit = groupBodyCache.get(key);
  if (hit) {
    groupBodyCache.delete(key);
    groupBodyCache.set(key, hit);
    return hit;
  }
  const body = await fetchJson<TamGroup>(assets, `${DATA_PREFIX}/groups/${key}.json`);
  if (body) {
    if (groupBodyCache.size >= GROUP_CACHE_MAX) {
      const oldest = groupBodyCache.keys().next().value;
      if (oldest) groupBodyCache.delete(oldest);
    }
    groupBodyCache.set(key, body);
    return body;
  }
  // Fallback: search in groups.json
  const all = await loadTamGroups(assets);
  const found = all.groups.find(
    (g) => g.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === key || g.name.toLowerCase() === key
  );
  return found ?? null;
}

export function filterTamGroups(
  groups: TamGroup[],
  opts: { q?: string; origin?: string; upstreamOnly?: boolean; limit?: number } = {}
): TamGroup[] {
  const { q, origin, upstreamOnly, limit = 50 } = opts;
  const needle = q?.toLowerCase();
  const out: TamGroup[] = [];
  for (const g of groups) {
    if (upstreamOnly && !g.isUpstream) continue;
    if (origin && g.suspected_origin.toLowerCase() !== origin.toLowerCase()) continue;
    if (needle) {
      const hay =
        `${g.name} ${g.aliases.join(' ')} ${g.suspected_origin} ${g.target_sectors.join(' ')} ${g.mitre_id ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(g);
    if (out.length >= limit) break;
  }
  return out;
}

export function filterTamTechniques(
  techniques: TamTechnique[],
  opts: { q?: string; tactic?: string; kill_chain?: string; limit?: number } = {}
): TamTechnique[] {
  const { q, tactic, kill_chain, limit = 50 } = opts;
  const needle = q?.toLowerCase();
  const out: TamTechnique[] = [];
  for (const t of techniques) {
    if (tactic && t.tactic !== tactic) continue;
    if (kill_chain && t.kill_chain !== kill_chain) continue;
    if (needle) {
      const hay = `${t.id} ${t.name} ${t.tactic} ${t.kill_chain} ${t.keywords.join(' ')}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

export function filterTamSources(
  sources: TamSource[],
  opts: { q?: string; category?: string; upstreamOnly?: boolean; limit?: number } = {}
): TamSource[] {
  const { q, category, upstreamOnly, limit = 50 } = opts;
  const needle = q?.toLowerCase();
  const out: TamSource[] = [];
  for (const s of sources) {
    if (upstreamOnly && !s.isUpstream) continue;
    if (category && s.category !== category) continue;
    if (needle) {
      const hay = `${s.name} ${s.url} ${s.category}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

export function tamCacheStats() {
  return {
    index: !!cachedIndex,
    groups: !!cachedGroups,
    techniques: !!cachedTechniques,
    sources: !!cachedSources,
    groupBodies: groupBodyCache.size,
  };
}

export function _resetTamCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = 0;
  cachedGroups = null;
  cachedGroupsAt = 0;
  cachedTechniques = null;
  cachedTechniquesAt = 0;
  cachedSources = null;
  cachedSourcesAt = 0;
  groupBodyCache.clear();
}
