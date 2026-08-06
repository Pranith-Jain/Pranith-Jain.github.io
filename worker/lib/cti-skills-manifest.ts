/**
 * CTI investigation skills manifest loader.
 *
 * Reads the custom CTI investigation methodology playbooks from
 * public/data/cti-skills/ (index.json + skills/<slug>.json) via env.ASSETS.
 * Mirrors the SI manifest loader pattern (LRU body cache, in-memory index).
 *
 * The skills are markdown playbooks that guide the investigator agent's
 * methodology per query type (IOC pivot, ransomware deep-dive, CVE triage,
 * APT profiling, domain infrastructure, malware sample analysis). The agent
 * lists/retrieves them via the cti_list_skills / cti_get_skill tools to pick
 * the right investigation methodology before running tools.
 */

import type { Fetcher } from '@cloudflare/workers-types';

export interface CtiSkillIndexEntry {
  slug: string;
  name: string;
  category: string;
  description: string;
  triggerKeywords: string[];
}

export interface CtiSkillBody {
  slug: string;
  name: string;
  category: string;
  description: string;
  triggerKeywords: string[];
  bodyMarkdown: string;
}

interface CtiIndex {
  source: string;
  license: string;
  generatedAt: string;
  counts: { skills: number };
  skills: CtiSkillIndexEntry[];
}

const INDEX_PATH = '/data/cti-skills/index.json';
const BODY_PATH = (slug: string) => `/data/cti-skills/skills/${slug}.json`;

// In-memory index cache (cold-start optimization — the index is read once per
// isolate, then reused. Bodies are cached LRU-style below.)
let indexCache: CtiIndex | null = null;
let indexCacheAt = 0;
const INDEX_TTL_MS = 5 * 60 * 1000; // 5 min

// LRU body cache (200 entries — same cap as SI manifest)
const bodyCache = new Map<string, CtiSkillBody>();
const BODY_CACHE_MAX = 200;

async function fetchAsset<T>(assets: Fetcher, path: string): Promise<T | null> {
  try {
    const res = await assets.fetch(`https://assets.local${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function loadCtiIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<CtiIndex> {
  const now = Date.now();
  if (!opts.forceRefresh && indexCache && now - indexCacheAt < INDEX_TTL_MS) {
    return indexCache;
  }
  const idx = await fetchAsset<CtiIndex>(assets, INDEX_PATH);
  if (idx && Array.isArray(idx.skills)) {
    indexCache = idx;
    indexCacheAt = now;
    return idx;
  }
  // Fallback: empty index so callers don't crash
  if (!indexCache) {
    indexCache = {
      source: 'pranithjain.qzz.io',
      license: 'MIT',
      generatedAt: '2026-08-06',
      counts: { skills: 0 },
      skills: [],
    };
  }
  return indexCache;
}

export async function getCtiSkill(assets: Fetcher, slug: string): Promise<CtiSkillBody | null> {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return null;
  const cached = bodyCache.get(slug);
  if (cached) return cached;

  const body = await fetchAsset<CtiSkillBody>(assets, BODY_PATH(slug));
  if (!body || !body.bodyMarkdown) return null;

  // LRU eviction
  if (bodyCache.size >= BODY_CACHE_MAX) {
    const oldest = bodyCache.keys().next().value;
    if (oldest) bodyCache.delete(oldest);
  }
  bodyCache.set(slug, body);
  return body;
}

export interface CtiListSkillsOptions {
  category?: string;
  keyword?: string;
  limit?: number;
}

export function filterCtiSkills(idx: CtiIndex, opts: CtiListSkillsOptions = {}): CtiSkillIndexEntry[] {
  let skills = [...idx.skills];
  if (opts.category) {
    const cat = opts.category.toLowerCase();
    skills = skills.filter((s) => s.category.toLowerCase().includes(cat));
  }
  if (opts.keyword) {
    const kw = opts.keyword.toLowerCase();
    skills = skills.filter(
      (s) =>
        s.name.toLowerCase().includes(kw) ||
        s.description.toLowerCase().includes(kw) ||
        s.triggerKeywords.some((k) => k.toLowerCase().includes(kw))
    );
  }
  return skills.slice(0, opts.limit ?? 50);
}

/** Pick the best-matching skill for a query (by trigger keyword match). */
export function pickCtiSkillForQuery(idx: CtiIndex, query: string, queryType: string): CtiSkillIndexEntry | null {
  const q = `${query} ${queryType}`.toLowerCase();
  let best: { skill: CtiSkillIndexEntry; score: number } | null = null;
  for (const skill of idx.skills) {
    let score = 0;
    for (const kw of skill.triggerKeywords) {
      if (q.includes(kw.toLowerCase())) score += kw.split(/\s+/).length; // longer keywords score higher
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { skill, score };
    }
  }
  return best?.skill ?? null;
}

export function ctiCacheStats() {
  return { indexLoaded: !!indexCache, skills: indexCache?.skills.length ?? 0, bodyCacheSize: bodyCache.size };
}

export function _resetCtiCacheForTests(): void {
  indexCache = null;
  indexCacheAt = 0;
  bodyCache.clear();
}
