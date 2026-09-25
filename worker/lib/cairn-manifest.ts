/**
 * CAIRN manifest — Cognitive Artifact Intelligence Research Network.
 *
 * Edge port of the portable core of
 * github.com/Cisco-Talos/Cognitive-Artifact-Intelligence-Research-Network
 * (MIT, Copyright (c) 2026 Cisco Systems, Inc.):
 *   - tiered YARA cognitive-artifact rules (T1 primitive / T2 behavioral /
 *     T3 family attribution) over VT-metadata scan text
 *   - named VT acquisition filters, A0–A11 archetype taxonomy, family reports
 *
 * The scan engine below is a TypeScript port of cairn/rules.py: substring
 * string hits + the condition subset (`any of them`, `N of them`,
 * `N of (...)`, `$id`, `$prefix*` inside N-of groups, and/or/not/parens).
 * Unknown/unsafe conditions fail closed (no match), matching upstream.
 *
 * Data source: public/data/cairn/ (built by scripts/build-cairn-manifest.mjs),
 * read through env.ASSETS — no D1, no KV, no public fetch.
 */

export interface CairnYaraString {
  id: string;
  pattern: string;
  nocase: boolean;
}

export interface CairnRule {
  name: string;
  tier: 'T1' | 'T2' | 'T3';
  confidence: number;
  artifactType: string;
  artifactClass: string;
  description: string;
  family: string | null;
  archetypes: string | null;
  reference: string | null;
  strings: CairnYaraString[];
  condition: string;
  source: string;
  sourceUrl: string;
  license: string;
}

export interface CairnRuleSlim {
  name: string;
  tier: 'T1' | 'T2' | 'T3';
  confidence: number;
  artifactClass: string;
  description: string;
  family: string | null;
  stringCount: number;
}

export interface CairnFamilySlim {
  slug: string;
  name: string;
  platform: string | null;
  archetype: string | null;
  summary: string;
}

export interface CairnFamilyBody extends CairnFamilySlim {
  title: string;
  aliases: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  tlp: string | null;
  body: string;
  source: string;
  sourceUrl: string;
  license: string;
}

export interface CairnFilter {
  name: string;
  slug: string;
  category: string;
  enabled: boolean;
  defaultLimit: number;
  minDetections: number;
  description: string;
  queryText: string;
}

export interface CairnArchetype {
  id: string;
  name: string;
  description: string;
  families: string[];
}

export interface CairnIndex {
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  counts: {
    rules: number;
    t1: number;
    t2: number;
    t3: number;
    filters: number;
    filtersEnabled: number;
    archetypes: number;
    families: number;
  };
  filterCategories: string[];
  rules: CairnRuleSlim[];
  families: CairnFamilySlim[];
}

export interface CairnStringHit {
  id: string;
  pattern: string;
  excerpt: string;
  offset: number;
}

export interface CairnMatch {
  rule: string;
  tier: 'T1' | 'T2' | 'T3';
  artifactType: string;
  artifactClass: string;
  confidence: number;
  description: string;
  family: string | null;
  matchedStrings: CairnStringHit[];
}

const DATA_PREFIX = '/data/cairn';

let cachedIndex: CairnIndex | null = null;
let cachedIndexAt: number | null = null;
const bodyCache = new Map<string, CairnRule | CairnFamilyBody>();
let bodyHits = 0;
let bodyMisses = 0;
const BODY_CACHE_MAX = 200;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const res = await assets.fetch(new Request(`https://cairn.local${path}`));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function bodyGet<T>(key: string): T | null {
  const v = bodyCache.get(key);
  if (v === undefined) {
    bodyMisses++;
    return null;
  }
  bodyHits++;
  // LRU refresh.
  bodyCache.delete(key);
  bodyCache.set(key, v);
  return v as unknown as T;
}

function bodySet(key: string, value: CairnRule | CairnFamilyBody): void {
  if (bodyCache.has(key)) bodyCache.delete(key);
  bodyCache.set(key, value);
  while (bodyCache.size > BODY_CACHE_MAX) {
    const oldest = bodyCache.keys().next();
    if (oldest.done) break;
    bodyCache.delete(oldest.value);
  }
}

export async function loadCairnIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<CairnIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<CairnIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `CAIRN index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-cairn-manifest.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export interface CairnRuleListOptions {
  tier?: string;
  keyword?: string;
  family?: string;
  limit?: number;
}

export function listCairnRules(idx: CairnIndex, opts: CairnRuleListOptions = {}): CairnRuleSlim[] {
  const { tier, keyword, family, limit = 50 } = opts;
  const needle = keyword?.toLowerCase();
  const out: CairnRuleSlim[] = [];
  for (const r of idx.rules) {
    if (tier && r.tier.toLowerCase() !== tier.toLowerCase()) continue;
    if (family && (r.family ?? '').toLowerCase() !== family.toLowerCase()) continue;
    if (needle) {
      const hay = `${r.name} ${r.artifactClass} ${r.description} ${r.family ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

export async function getCairnRule(assets: Fetcher, name: string): Promise<CairnRule | null> {
  const key = `rule:${name}`;
  const cached = bodyGet<CairnRule>(key);
  if (cached) return cached;
  const body = await fetchJson<CairnRule>(assets, `${DATA_PREFIX}/rules/${encodeURIComponent(name)}.json`);
  if (!body) return null;
  bodySet(key, body);
  return body;
}

export async function listCairnFamilies(
  assets: Fetcher,
  opts: { archetype?: string; keyword?: string } = {}
): Promise<CairnFamilySlim[]> {
  const idx = await loadCairnIndex(assets);
  const needle = opts.keyword?.toLowerCase();
  return idx.families.filter((f) => {
    if (opts.archetype && !(f.archetype ?? '').toLowerCase().includes(opts.archetype.toLowerCase())) return false;
    if (
      needle &&
      `${f.name} ${f.platform ?? ''} ${f.archetype ?? ''} ${f.summary}`.toLowerCase().includes(needle) === false
    )
      return false;
    return true;
  });
}

export async function getCairnFamily(assets: Fetcher, slug: string): Promise<CairnFamilyBody | null> {
  const key = `family:${slug.toLowerCase()}`;
  const cached = bodyGet<CairnFamilyBody>(key);
  if (cached) return cached;
  const body = await fetchJson<CairnFamilyBody>(
    assets,
    `${DATA_PREFIX}/families/${encodeURIComponent(slug.toLowerCase())}.json`
  );
  if (!body) return null;
  bodySet(key, body);
  return body;
}

export interface CairnFiltersData {
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  total: number;
  enabled: number;
  categories: string[];
  filters: CairnFilter[];
}

export async function loadCairnFilters(assets: Fetcher): Promise<CairnFiltersData> {
  const data = await fetchJson<CairnFiltersData>(assets, `${DATA_PREFIX}/filters.json`);
  if (!data) {
    throw new Error(
      `CAIRN filters not found at ${DATA_PREFIX}/filters.json — run 'node scripts/build-cairn-manifest.mjs' first.`
    );
  }
  return data;
}

export function filterCairnFilters(
  data: CairnFiltersData,
  opts: { category?: string; enabledOnly?: boolean; keyword?: string } = {}
): CairnFilter[] {
  const needle = opts.keyword?.toLowerCase();
  return data.filters.filter((f) => {
    if (opts.category && f.category.toLowerCase() !== opts.category.toLowerCase()) return false;
    if (opts.enabledOnly && !f.enabled) return false;
    if (needle && `${f.name} ${f.slug} ${f.description} ${f.queryText}`.toLowerCase().includes(needle) === false)
      return false;
    return true;
  });
}

export interface CairnArchetypesData {
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  total: number;
  archetypes: CairnArchetype[];
}

export async function loadCairnArchetypes(assets: Fetcher): Promise<CairnArchetypesData> {
  const data = await fetchJson<CairnArchetypesData>(assets, `${DATA_PREFIX}/archetypes.json`);
  if (!data) {
    throw new Error(
      `CAIRN archetypes not found at ${DATA_PREFIX}/archetypes.json — run 'node scripts/build-cairn-manifest.mjs' first.`
    );
  }
  return data;
}

// ─── Scan engine (port of cairn/rules.py) ───────────────────────────────

function excerpt(text: string, offset: number, length: number): string {
  const start = Math.max(0, offset - 96);
  const end = Math.min(text.length, offset + length + 96);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return (prefix + text.slice(start, end).replace(/\n/g, ' ').trim() + suffix).slice(0, 256);
}

function stringHits(text: string, rule: CairnRule): Map<string, CairnStringHit[]> {
  const hits = new Map<string, CairnStringHit[]>();
  for (const s of rule.strings) {
    const haystack = s.nocase ? text.toLowerCase() : text;
    const needle = s.nocase ? s.pattern.toLowerCase() : s.pattern;
    if (!needle) continue;
    let offset = haystack.indexOf(needle);
    while (offset >= 0) {
      const arr = hits.get(s.id) ?? [];
      arr.push({ id: s.id, pattern: s.pattern, excerpt: excerpt(text, offset, s.pattern.length), offset });
      hits.set(s.id, arr);
      offset = haystack.indexOf(needle, offset + Math.max(1, needle.length));
      // Bound per-string hits to keep scan output small.
      if (arr.length >= 5) break;
    }
  }
  return hits;
}

// Tiny boolean expression parser: True/False/and/or/not/parens.
function parseBoolExpr(tokens: string[], pos: { i: number }): boolean {
  function parseOr(): boolean {
    let v = parseAnd();
    while (tokens[pos.i] === 'or') {
      pos.i++;
      const rhs = parseAnd();
      v = v || rhs;
    }
    return v;
  }
  function parseAnd(): boolean {
    let v = parseNot();
    while (tokens[pos.i] === 'and') {
      pos.i++;
      const rhs = parseNot();
      v = v && rhs;
    }
    return v;
  }
  function parseNot(): boolean {
    if (tokens[pos.i] === 'not') {
      pos.i++;
      return !parseNot();
    }
    return parseAtom();
  }
  function parseAtom(): boolean {
    const tok = tokens[pos.i];
    if (tok === '(') {
      pos.i++;
      const v = parseOr();
      if (tokens[pos.i] !== ')') throw new Error('unbalanced parens');
      pos.i++;
      return v;
    }
    if (tok === 'True') {
      pos.i++;
      return true;
    }
    if (tok === 'False') {
      pos.i++;
      return false;
    }
    throw new Error(`unexpected token: ${tok}`);
  }
  return parseOr();
}

function safeBoolEval(expr: string): boolean | null {
  const tokens = expr.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').split(/\s+/).filter(Boolean);
  // Fail closed on anything outside the boolean grammar.
  if (
    !tokens.every(
      (t) => t === 'True' || t === 'False' || t === 'and' || t === 'or' || t === 'not' || t === '(' || t === ')'
    )
  ) {
    return null;
  }
  try {
    const pos = { i: 0 };
    const v = parseBoolExpr(tokens, pos);
    if (pos.i !== tokens.length) return null;
    return v;
  } catch {
    return null;
  }
}

/** Evaluate a CAIRN rule condition against string-hit ids. Fail-closed. */
export function cairnConditionMatches(condition: string, hitIds: Set<string>): boolean {
  let expression = condition.split(/\s+/).join(' ');

  // `N of (members)` — members are $ids or $prefix* wildcards.
  expression = expression.replace(/(\d+)\s+of\s+\(([^)]+)\)/gi, (_m, countStr: string, membersStr: string) => {
    const count = parseInt(countStr, 10);
    const members = membersStr.split(',').map((s: string) => s.trim());
    let matched = 0;
    for (const member of members) {
      if (member.endsWith('*')) {
        const prefix = member.slice(0, -1);
        matched += [...hitIds].filter((id) => id.startsWith(prefix)).length;
      } else if (hitIds.has(member)) {
        matched += 1;
      }
    }
    return matched >= count ? 'True' : 'False';
  });

  expression = expression.replace(/\bany\s+of\s+them\b/gi, hitIds.size > 0 ? 'True' : 'False');
  expression = expression.replace(/\b(\d+)\s+of\s+them\b/gi, (_m, n: string) =>
    hitIds.size >= parseInt(n, 10) ? 'True' : 'False'
  );

  // Bare identifiers ($id). A trailing `*` outside an N-of group is
  // unsupported upstream (fails the safety fullmatch → False); mirror that.
  expression = expression.replace(/\$\w+\*?/g, (id) => {
    if (id.endsWith('*')) return id; // leave → safety check fails → null → false
    return hitIds.has(id) ? 'True' : 'False';
  });
  expression = expression
    .replace(/\bAND\b/gi, 'and')
    .replace(/\bOR\b/gi, 'or')
    .replace(/\bNOT\b/gi, 'not');

  const result = safeBoolEval(expression);
  return result === true;
}

export function scanCairnText(rules: CairnRule[], text: string): CairnMatch[] {
  const matches: CairnMatch[] = [];
  const input = text ?? '';
  for (const rule of rules) {
    const hits = stringHits(input, rule);
    const hitIds = new Set([...hits.keys()]);
    if (cairnConditionMatches(rule.condition, hitIds)) {
      matches.push({
        rule: rule.name,
        tier: rule.tier,
        artifactType: rule.artifactType,
        artifactClass: rule.artifactClass,
        confidence: rule.confidence,
        description: rule.description,
        family: rule.family,
        matchedStrings: [...hits.values()].flat(),
      });
    }
  }
  // Highest tier + confidence first (T3 attribution above T1 primitives).
  const tierRank = { T3: 0, T2: 1, T1: 2 } as const;
  matches.sort((a, b) => tierRank[a.tier] - tierRank[b.tier] || b.confidence - a.confidence);
  return matches;
}

export function cairnCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
  bodies: number;
  bodyHits: number;
  bodyMisses: number;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
    bodies: bodyCache.size,
    bodyHits,
    bodyMisses,
  };
}

export function _resetCairnCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
  bodyCache.clear();
  bodyHits = 0;
  bodyMisses = 0;
}
