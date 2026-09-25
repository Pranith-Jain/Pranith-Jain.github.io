/**
 * NOVA manifest — prompt pattern matching for malicious prompts.
 *
 * Edge port of the deterministic core of
 * github.com/Nova-Hunting/nova-framework (MIT, Copyright (c) 2024 Thomas
 * Roccia): keyword evaluation (evaluators/keywords.py), condition evaluation
 * (evaluators/condition.py), and prompt normalization (utils/helpers.py),
 * over the github.com/Nova-Hunting/nova-rules collection (MIT).
 *
 * Edge boundary: only `keywords` patterns evaluate on Workers. `semantics`
 * (sentence-transformers) and `llm` (provider APIs) patterns are stored as
 * data and reported as unevaluable gates — fail-closed, matching upstream
 * NovaMatcher behavior when an evaluator is unavailable.
 *
 * Data source: public/data/nova/ (built by scripts/build-nova-manifest.mjs),
 * read through env.ASSETS — no D1, no KV, no public fetch.
 */

export interface NovaKeywordPattern {
  pattern: string;
  isRegex: boolean;
  caseSensitive: boolean;
}

export interface NovaThresholdPattern {
  pattern: string;
  threshold: number;
}

export interface NovaRuleMeta {
  description: string;
  author: string | null;
  version: string | null;
  category: string | null;
  severity: string | null;
  uuid: string | null;
  date: string | null;
  reference: string | null;
}

export interface NovaRule {
  name: string;
  file: string;
  meta: NovaRuleMeta;
  keywords: Record<string, NovaKeywordPattern>;
  semantics: Record<string, NovaThresholdPattern>;
  llm: Record<string, NovaThresholdPattern>;
  condition: string;
  needs: { keywords: boolean; semantics: boolean; llm: boolean };
  keywordOnly: boolean;
  source: string;
  fileUrl: string;
  license: string;
}

export interface NovaRuleSlim {
  name: string;
  file: string;
  category: string | null;
  severity: string | null;
  description: string;
  keywordCount: number;
  semanticCount: number;
  llmCount: number;
  keywordOnly: boolean;
}

export interface NovaIndex {
  source: string;
  sourceUrl: string;
  engineSource: string;
  engineUrl: string;
  license: string;
  replicatedAt: string;
  edgeNote: string;
  counts: {
    rules: number;
    files: number;
    keywords: number;
    semantics: number;
    llm: number;
    keywordOnly: number;
    skipped: number;
  };
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  rules: NovaRuleSlim[];
}

export interface NovaTaxonomyThreat {
  slug: string;
  name: string;
  example: string;
}

export interface NovaTaxonomyCategory {
  id: string;
  name: string;
  description: string;
  threats: NovaTaxonomyThreat[];
}

export interface NovaTaxonomy {
  source: string;
  sourceUrl: string;
  rulesSource: string;
  license: string;
  replicatedAt: string;
  total: number;
  threatCount: number;
  categories: NovaTaxonomyCategory[];
}

const DATA_PREFIX = '/data/nova';

let cachedIndex: NovaIndex | null = null;
let cachedIndexAt: number | null = null;
let cachedTaxonomy: NovaTaxonomy | null = null;
const ruleCache = new Map<string, NovaRule>();
let ruleHits = 0;
let ruleMisses = 0;
const RULE_CACHE_MAX = 200;

async function fetchJson<T>(assets: Fetcher, path: string): Promise<T | null> {
  const res = await assets.fetch(new Request(`https://nova.local${path}`));
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function loadNovaIndex(assets: Fetcher, opts: { forceRefresh?: boolean } = {}): Promise<NovaIndex> {
  if (cachedIndex && !opts.forceRefresh) return cachedIndex;
  const idx = await fetchJson<NovaIndex>(assets, `${DATA_PREFIX}/index.json`);
  if (!idx) {
    throw new Error(
      `NOVA index not found at ${DATA_PREFIX}/index.json — run 'node scripts/build-nova-manifest.mjs' first.`
    );
  }
  cachedIndex = idx;
  cachedIndexAt = Date.now();
  return idx;
}

export async function loadNovaTaxonomy(assets: Fetcher): Promise<NovaTaxonomy> {
  if (cachedTaxonomy) return cachedTaxonomy;
  const tax = await fetchJson<NovaTaxonomy>(assets, `${DATA_PREFIX}/taxonomy.json`);
  if (!tax) {
    throw new Error(
      `NOVA taxonomy not found at ${DATA_PREFIX}/taxonomy.json — run 'node scripts/build-nova-manifest.mjs' first.`
    );
  }
  cachedTaxonomy = tax;
  return tax;
}

export interface NovaRuleListOptions {
  category?: string;
  severity?: string;
  keyword?: string;
  keywordOnly?: boolean;
  limit?: number;
}

export function listNovaRules(idx: NovaIndex, opts: NovaRuleListOptions = {}): NovaRuleSlim[] {
  const { category, severity, keyword, keywordOnly, limit = 50 } = opts;
  const needle = keyword?.toLowerCase();
  const out: NovaRuleSlim[] = [];
  for (const r of idx.rules) {
    if (category && (r.category ?? '').toLowerCase() !== category.toLowerCase()) continue;
    if (severity && (r.severity ?? '').toLowerCase() !== severity.toLowerCase()) continue;
    if (keywordOnly && !r.keywordOnly) continue;
    if (needle && `${r.name} ${r.file} ${r.category ?? ''} ${r.description}`.toLowerCase().includes(needle) === false)
      continue;
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

export async function getNovaRule(assets: Fetcher, name: string): Promise<NovaRule | null> {
  const hit = ruleCache.get(name);
  if (hit) {
    ruleHits++;
    ruleCache.delete(name);
    ruleCache.set(name, hit);
    return hit;
  }
  ruleMisses++;
  const body = await fetchJson<NovaRule>(assets, `${DATA_PREFIX}/rules/${encodeURIComponent(name)}.json`);
  if (!body) return null;
  ruleCache.set(name, body);
  while (ruleCache.size > RULE_CACHE_MAX) {
    const oldest = ruleCache.keys().next();
    if (oldest.done) break;
    ruleCache.delete(oldest.value);
  }
  return body;
}

// ─── Prompt normalization (port of nova/utils/helpers.py) ──────────────
// NFKC + 70-entry confusable map (Cyrillic/Greek homoglyphs, zero-width and
// invisible chars, dash variants). Verbatim from upstream CONFUSABLES.
const CONFUSABLES: Record<string, string> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  х: 'x',
  у: 'y',
  і: 'i',
  ј: 'j',
  ѕ: 's',
  һ: 'h',
  ԁ: 'd',
  ɡ: 'g',
  ν: 'v',
  А: 'A',
  Е: 'E',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  Х: 'X',
  У: 'Y',
  М: 'M',
  Н: 'H',
  В: 'B',
  К: 'K',
  І: 'I',
  Α: 'A',
  Β: 'B',
  Ε: 'E',
  Η: 'H',
  Ι: 'I',
  Κ: 'K',
  Μ: 'M',
  Ν: 'N',
  Ο: 'O',
  Ρ: 'P',
  Τ: 'T',
  Υ: 'Y',
  Χ: 'X',
  Ζ: 'Z',
  ο: 'o',
  α: 'a',
  '​': '',
  '‌': '',
  '‍': '',
  '‎': '',
  '‏': '',
  '﻿': '',
  '­': '',
  '⁠': '',
  '⁡': '',
  '⁢': '',
  '⁣': '',
  '⁤': '',
  ℓ: 'l',
  ℬ: 'B',
  ℰ: 'E',
  ℱ: 'F',
  ℳ: 'M',
  ℛ: 'R',
  '℮': 'e',
  ⅰ: 'i',
  ⅱ: 'ii',
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '–': '-',
  '—': '-',
  '―': '-',
};

export function normalizePrompt(text: string): string {
  if (!text) return text;
  const out = text.normalize('NFKC');
  let mapped = '';
  for (const ch of out) mapped += CONFUSABLES[ch] ?? ch;
  return mapped;
}

// ─── Keyword evaluation (port of evaluators/keywords.py) ───────────────

export function evaluateKeyword(pattern: NovaKeywordPattern, text: string): boolean {
  if (text == null || typeof text !== 'string' || !text.trim()) return false;
  if (pattern.isRegex) {
    try {
      const flags = pattern.caseSensitive ? '' : 'i';
      return new RegExp(pattern.pattern, flags).test(text);
    } catch {
      return false;
    }
  }
  if (pattern.caseSensitive) return text.includes(pattern.pattern);
  return text.toLowerCase().includes(pattern.pattern.toLowerCase());
}

export function evaluateNovaKeywords(rule: NovaRule, prompt: string): Record<string, boolean> {
  const normalized = normalizePrompt(prompt);
  const out: Record<string, boolean> = {};
  for (const [key, pattern] of Object.entries(rule.keywords)) {
    try {
      out[key] = evaluateKeyword(pattern, normalized);
    } catch {
      out[key] = false;
    }
  }
  return out;
}

// ─── Condition evaluation (port of evaluators/condition.py) ────────────

type MatchMaps = {
  keywords: Record<string, boolean>;
  semantics: Record<string, boolean>;
  llm: Record<string, boolean>;
};

function truthyCount(m: Record<string, boolean>): number {
  return Object.values(m).filter(Boolean).length;
}

function quantifierResult(quantifier: string, total: number, truthy: number): boolean {
  const q = quantifier.toLowerCase();
  if (q === 'any') return truthy > 0;
  if (q === 'all') return total > 0 && truthy === total;
  return truthy >= parseInt(q, 10);
}

function sectionMatches(section: string, maps: MatchMaps): Record<string, boolean> {
  const s = section.toLowerCase();
  if (s === 'keywords') return maps.keywords;
  if (s === 'semantics') return maps.semantics;
  if (s === 'llm') return maps.llm;
  return {};
}

function prefixMatches(prefix: string, ...dicts: Record<string, boolean>[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const d of dicts) {
    for (const [k, v] of Object.entries(d)) {
      if (k.startsWith('$') && k.slice(1).startsWith(prefix)) out[k] = v;
    }
  }
  return out;
}

function parseBoolTokens(tokens: string[], pos: { i: number }): boolean {
  function parseOr(): boolean {
    let v = parseAnd();
    while (tokens[pos.i] === 'or') {
      pos.i++;
      v = parseAnd() || v;
    }
    return v;
  }
  function parseAnd(): boolean {
    let v = parseNot();
    while (tokens[pos.i] === 'and') {
      pos.i++;
      v = parseNot() && v;
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
  if (!tokens.every((t) => ['True', 'False', 'and', 'or', 'not', '(', ')'].includes(t))) return null;
  try {
    const pos = { i: 0 };
    const v = parseBoolTokens(tokens, pos);
    return pos.i === tokens.length ? v : null;
  } catch {
    return null;
  }
}

/** Evaluate a NOVA condition. Unknown references are False; unsafe syntax fails closed. */
export function evaluateNovaCondition(condition: string, maps: MatchMaps): boolean {
  if (!condition || !condition.trim()) return false;
  const original = condition;
  let expr = condition.trim();
  if ((expr.match(/\(/g) || []).length !== (expr.match(/\)/g) || []).length) return false;

  // Quantifiers must run before raw wildcards.
  expr = expr.replace(/\b(any|all|\d+)\s+of\s+\(\$([a-zA-Z0-9_]+)\*\)/gi, (_m, q: string, prefix: string) => {
    const m = prefixMatches(prefix, maps.keywords, maps.semantics, maps.llm);
    return quantifierResult(q, Object.keys(m).length, truthyCount(m)) ? 'True' : 'False';
  });
  expr = expr.replace(
    /\b(any|all|\d+)\s+of\s+(keywords|semantics|llm)\.\$([a-zA-Z0-9_]+)\*/gi,
    (_m, q: string, section: string, prefix: string) => {
      const m = prefixMatches(prefix, sectionMatches(section, maps));
      return quantifierResult(q, Object.keys(m).length, truthyCount(m)) ? 'True' : 'False';
    }
  );
  expr = expr.replace(
    /\b(any|all|\d+)\s+of\s+(keywords|semantics|llm)(?:\.\*)?/gi,
    (_m, q: string, section: string) => {
      const m = sectionMatches(section, maps);
      return quantifierResult(q, Object.keys(m).length, truthyCount(m)) ? 'True' : 'False';
    }
  );
  expr = expr.replace(/(keywords|semantics|llm)\.\$([a-zA-Z0-9_]+)\*/gi, (_m, section: string, prefix: string) => {
    const m = prefixMatches(prefix, sectionMatches(section, maps));
    return truthyCount(m) > 0 ? 'True' : 'False';
  });
  for (const section of ['keywords', 'semantics', 'llm'] as const) {
    const any = truthyCount(maps[section]) > 0;
    expr = expr.split(`${section}.*`).join(any ? 'True' : 'False');
  }
  expr = expr.replace(
    /(keywords|semantics|llm)\.\$([a-zA-Z0-9_]+)(?![a-zA-Z0-9_]*\*)/gi,
    (_m, section: string, name: string) => {
      const v = sectionMatches(section, maps)[`$${name}`] === true;
      return v ? 'True' : 'False';
    }
  );
  expr = expr.replace(/(?<![a-zA-Z0-9_.$])(\$[a-zA-Z0-9_]+)(?![a-zA-Z0-9_*])/g, (varName) => {
    const v = maps.keywords[varName] === true || maps.semantics[varName] === true || maps.llm[varName] === true;
    return v ? 'True' : 'False';
  });
  expr = expr
    .replace(/\band\b/gi, 'and')
    .replace(/\bor\b/gi, 'or')
    .replace(/\bnot\b/gi, 'not');
  expr = expr.replace(/\s+/g, ' ').trim();
  expr = expr.replace(/\btrue\b/gi, 'True').replace(/\bfalse\b/gi, 'False');

  const result = safeBoolEval(expr);
  if (result !== null) return result;

  // Fallback: single section.$var reference (mirrors upstream).
  const single = original.trim().match(/^(keywords|semantics|llm)\.\$[a-zA-Z0-9_]+$/);
  if (single) {
    const parts = original.trim().split('.');
    const section = parts[0] ?? '';
    const v = parts[1] ?? '';
    if (section && v) return sectionMatches(section, maps)[v] === true;
  }
  return false;
}

// ─── Short-circuit gating (port of can_*_change_outcome) ───────────────

function standaloneVariables(condition: string): Set<string> {
  const out = new Set<string>();
  for (const m of condition.matchAll(/(?<![a-zA-Z0-9_.$])(\$[a-zA-Z0-9_]+)(?![a-zA-Z0-9_*])/g)) {
    if (m[1] !== undefined) out.add(m[1]);
  }
  return out;
}

function candidateSectionVariables(
  condition: string,
  section: 'semantics' | 'llm',
  known: Record<string, boolean>
): Set<string> {
  const candidates = new Set<string>();
  const secRe = new RegExp(`${section}\\.\\$([a-zA-Z0-9_]+)(?![a-zA-Z0-9_]*\\*)`, 'gi');
  for (const m of condition.matchAll(secRe)) {
    if (m[1] !== undefined) candidates.add(`$${m[1]}`);
  }
  const lower = condition.toLowerCase();
  let wildcardCount = 0;
  if (lower.includes(`${section}.*`)) wildcardCount = 1;
  for (const m of lower.matchAll(new RegExp(`(\\d+)\\s+of\\s+${section}(?:\\.\\*)?`, 'g'))) {
    if (m[1] !== undefined) wildcardCount = Math.max(wildcardCount, parseInt(m[1], 10));
  }
  if (new RegExp(`\\b(any|all)\\s+of\\s+${section}(?:\\.\\*)?\\b`).test(lower))
    wildcardCount = Math.max(wildcardCount, 1);
  for (const m of lower.matchAll(new RegExp(`(\\d+)\\s+of\\s+${section}\\.\\$([a-zA-Z0-9_]+)\\*`, 'g'))) {
    if (m[1] !== undefined) wildcardCount = Math.max(wildcardCount, parseInt(m[1], 10));
  }
  for (let i = 0; i < wildcardCount; i++) candidates.add(`$${section}_wildcard_${i}`);
  for (const pat of [
    `(any|all|\\d+)\\s+of\\s+${section}\\.\\$([a-zA-Z0-9_]+)\\*`,
    '(any|all|\\d+)\\s+of\\s+\\(\\$([a-zA-Z0-9_]+)\\*\\)',
  ]) {
    for (const m of condition.matchAll(new RegExp(pat, 'gi'))) {
      const q = (m[1] ?? '').toLowerCase();
      const prefix = m[2] ?? '';
      if (!prefix) continue;
      const count = /^\d+$/.test(q) ? parseInt(q, 10) : 1;
      for (let i = 0; i < count; i++) candidates.add(`$${prefix}_candidate_${i}`);
    }
  }
  for (const v of standaloneVariables(condition)) {
    if (!(v in known)) candidates.add(v);
  }
  return candidates;
}

function sectionCanChange(
  condition: string,
  maps: MatchMaps,
  section: 'semantics' | 'llm',
  candidates: Set<string>
): boolean {
  if (!condition || candidates.size === 0) return false;
  if (candidates.size > 10) return true; // avoid exponential work; evaluate is safer
  let base: boolean;
  try {
    base = evaluateNovaCondition(condition, maps);
  } catch {
    return true;
  }
  const names = [...candidates].sort();
  const total = 1 << names.length;
  for (let mask = 0; mask < total; mask++) {
    const trial: Record<string, boolean> = {};
    names.forEach((n, i) => {
      trial[n] = (mask & (1 << i)) !== 0;
    });
    const test: MatchMaps = {
      keywords: maps.keywords,
      semantics: section === 'semantics' ? { ...maps.semantics, ...trial } : maps.semantics,
      llm: section === 'llm' ? { ...maps.llm, ...trial } : maps.llm,
    };
    try {
      if (evaluateNovaCondition(condition, test) !== base) return true;
    } catch {
      return true;
    }
  }
  return false;
}

export function canSemanticsChangeOutcome(condition: string, keywordMatches: Record<string, boolean>): boolean {
  return sectionCanChange(
    condition,
    { keywords: keywordMatches, semantics: {}, llm: {} },
    'semantics',
    candidateSectionVariables(condition, 'semantics', keywordMatches)
  );
}

export function canLlmChangeOutcome(
  condition: string,
  keywordMatches: Record<string, boolean>,
  semanticMatches: Record<string, boolean>
): boolean {
  const known = { ...keywordMatches, ...semanticMatches };
  return sectionCanChange(
    condition,
    { keywords: keywordMatches, semantics: semanticMatches, llm: {} },
    'llm',
    candidateSectionVariables(condition, 'llm', known)
  );
}

// ─── Prompt scan (keywords stage only; semantics/llm are gates) ────────

export interface NovaScanResult {
  matched: boolean;
  ruleName: string;
  verdict: 'match' | 'no-match' | 'needs-semantics' | 'needs-llm';
  matchingKeywords: string[];
  keywordMatches: Record<string, boolean>;
  unevaluable: { semantics: string[]; llm: string[] };
  evaluationWarnings: string[];
  condition: string;
}

export function scanNovaPrompt(rule: NovaRule, prompt: string): NovaScanResult {
  const warnings: string[] = [];
  if (prompt == null || typeof prompt !== 'string' || !prompt.trim()) {
    return {
      matched: false,
      ruleName: rule.name,
      verdict: 'no-match',
      matchingKeywords: [],
      keywordMatches: {},
      unevaluable: { semantics: Object.keys(rule.semantics), llm: Object.keys(rule.llm) },
      evaluationWarnings: ['Empty prompt — nothing to evaluate.'],
      condition: rule.condition,
    };
  }
  const keywordMatches = evaluateNovaKeywords(rule, prompt);
  const maps: MatchMaps = { keywords: keywordMatches, semantics: {}, llm: {} };

  // Short-circuit: keywords alone may already decide the condition.
  try {
    if (evaluateNovaCondition(rule.condition, maps)) {
      if (
        !canSemanticsChangeOutcome(rule.condition, keywordMatches) &&
        !canLlmChangeOutcome(rule.condition, keywordMatches, {})
      ) {
        return done(true, 'match');
      }
    }
  } catch {
    // fall through to gating
  }

  const semanticsCould = canSemanticsChangeOutcome(rule.condition, keywordMatches);
  const llmCould = canLlmChangeOutcome(rule.condition, keywordMatches, {});
  if (!semanticsCould && !llmCould) {
    let final = false;
    try {
      final = evaluateNovaCondition(rule.condition, maps);
    } catch {
      final = false;
    }
    return done(final, final ? 'match' : 'no-match');
  }

  // Fail closed: a referenced-but-unevaluable stage could change the outcome.
  if (semanticsCould && Object.keys(rule.semantics).length > 0) {
    warnings.push(
      `Rule '${rule.name}' references semantics patterns that need a sentence-transformer model — unavailable on the edge. Failing closed (no match).`
    );
    return done(false, 'needs-semantics', warnings);
  }
  if (llmCould && Object.keys(rule.llm).length > 0) {
    warnings.push(
      `Rule '${rule.name}' references llm patterns that need a provider API call (openai/anthropic/azure/groq/ollama/openrouter) — unavailable on the edge. Failing closed (no match).`
    );
    return done(false, 'needs-llm', warnings);
  }
  // Gate referenced a section with no stored patterns (e.g. condition mentions
  // semantics but the rule defines none) — decide on keywords alone.
  let final = false;
  try {
    final = evaluateNovaCondition(rule.condition, maps);
  } catch {
    final = false;
  }
  return done(final, final ? 'match' : 'no-match', warnings);

  function done(matched: boolean, verdict: NovaScanResult['verdict'], extra: string[] = []): NovaScanResult {
    return {
      matched,
      ruleName: rule.name,
      verdict,
      matchingKeywords: Object.entries(keywordMatches)
        .filter(([, v]) => v)
        .map(([k]) => k),
      keywordMatches,
      unevaluable: { semantics: Object.keys(rule.semantics), llm: Object.keys(rule.llm) },
      evaluationWarnings: [...warnings, ...extra],
      condition: rule.condition,
    };
  }
}

export function novaCacheStats(): {
  indexLoaded: boolean;
  indexAgeMs: number | null;
  rules: number;
  ruleHits: number;
  ruleMisses: number;
  taxonomyLoaded: boolean;
} {
  return {
    indexLoaded: cachedIndex !== null,
    indexAgeMs: cachedIndexAt ? Date.now() - cachedIndexAt : null,
    rules: ruleCache.size,
    ruleHits,
    ruleMisses,
    taxonomyLoaded: cachedTaxonomy !== null,
  };
}

export function _resetNovaCacheForTests(): void {
  cachedIndex = null;
  cachedIndexAt = null;
  cachedTaxonomy = null;
  ruleCache.clear();
  ruleHits = 0;
  ruleMisses = 0;
}
