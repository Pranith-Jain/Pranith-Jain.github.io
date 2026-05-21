/**
 * Detection engine — pure, dependency-free rule evaluator.
 *
 * It takes a list of detection rules and a list of observed indicators
 * (the unified live-IOC stream, see routes/live-iocs.ts) and returns the
 * rules that fired plus the indicators that triggered them.
 *
 * Two rule shapes:
 *   - simple match: every predicate in `match` must hold for an indicator;
 *     the rule fires once it has ≥ `minMatches` matched indicators.
 *   - aggregate: matched indicators are grouped by `aggregate.groupBy`;
 *     a group fires when its size (or its distinct-`distinctBy` count)
 *     reaches `aggregate.minCount`. This is how cross-feed consensus is
 *     expressed ("same value seen by ≥ N distinct sources").
 *
 * There is NO native YARA/Sigma execution here — those are file/log engines.
 * This engine evaluates structured threat-feed indicators, which is what the
 * platform actually has at the edge. The DSL is intentionally small so the
 * exact same module runs server-side (cron pack) and client-side (the
 * /dfir/detection-lab playground). This is a verbatim mirror of the
 * canonical `api/src/lib/detection-engine.ts`; keep the two in sync.
 */

export type EngineIocKind = 'ip' | 'url' | 'domain' | 'hash';

export interface EngineIndicator {
  value: string;
  kind: EngineIocKind;
  source: string;
  reporter?: string;
  context?: string;
  reference_url?: string;
  observed_at?: string;
}

export type DetectionSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Predicate body shared by `match` and `exclude`. Every present field has
 * to hold AND-style for the indicator to match the predicate.
 */
export interface MatchPredicate {
  kind?: EngineIocKind | EngineIocKind[];
  /** Exact feed source id(s) — e.g. "c2-intel", "threatfox". */
  source?: string | string[];
  /** Case-insensitive regex tested against the indicator value. */
  valueRegex?: string;
  /** Case-insensitive regex tested against the context string. */
  contextRegex?: string;
  /** Case-insensitive regex tested against the reporter string. */
  reporterRegex?: string;
}

export interface DetectionRule {
  id: string;
  name: string;
  severity: DetectionSeverity;
  description?: string;
  enabled?: boolean;
  /** Every provided predicate must hold for an indicator to match. */
  match: MatchPredicate;
  /**
   * Suppression clause. An indicator that matches BOTH `match` AND
   * `exclude` is dropped from the rule's matched set — useful for tuning
   * out a known-benign source / context pattern without weakening the
   * primary predicate. Same shape as `match`; omit to skip suppression.
   */
  exclude?: MatchPredicate;
  /** Cross-indicator consensus. Omit for a flat per-indicator rule. */
  aggregate?: {
    groupBy: 'value' | 'source' | 'reporter' | 'kind' | 'context';
    /** Group fires once it reaches this size / distinct count. */
    minCount: number;
    /** Count distinct values of this field within a group instead of rows. */
    distinctBy?: 'source' | 'reporter' | 'value';
  };
  /** Non-aggregate rules fire at this many total matches (default 1). */
  minMatches?: number;
  /**
   * Optional MITRE ATT&CK technique id, e.g. `T1190`, `T1071.001`. Surface
   * metadata only — the engine doesn't read it; the UI shows it as a pill
   * on detections so the analyst can pivot to the ATT&CK matrix.
   */
  technique?: string;
  /** Optional ATT&CK tactic label, e.g. "Initial Access". UI-only. */
  tactic?: string;
  /** Citations for the rule's logic — vendor advisories, blog posts, CVEs. */
  references?: string[];
}

export interface Detection {
  rule_id: string;
  rule_name: string;
  severity: DetectionSeverity;
  description?: string;
  /** Indicators (or distinct-key count for aggregate) that triggered it. */
  match_count: number;
  /** The aggregate group key that fired, when the rule is an aggregate. */
  group_key?: string;
  /** Bounded sample of the triggering indicators. */
  indicators: EngineIndicator[];
  first_observed?: string;
  last_observed?: string;
  /** Copied from the rule for UI convenience — see DetectionRule.technique. */
  technique?: string;
  tactic?: string;
  references?: string[];
}

export interface EvaluateResult {
  detections: Detection[];
  /** Rule ids skipped because a regex failed to compile (with reason). */
  warnings: { rule_id: string; message: string }[];
}

const SAMPLE_CAP = 25;

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Compile a case-insensitive regex; throws a readable error on failure. */
function compile(pattern: string, field: string): RegExp {
  try {
    return new RegExp(pattern, 'i');
  } catch (e) {
    throw new Error(`invalid ${field} regex: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function observedBounds(items: EngineIndicator[]): { first?: string; last?: string } {
  let first: string | undefined;
  let last: string | undefined;
  for (const it of items) {
    if (!it.observed_at) continue;
    if (first === undefined || it.observed_at < first) first = it.observed_at;
    if (last === undefined || it.observed_at > last) last = it.observed_at;
  }
  return { first, last };
}

function groupKey(it: EngineIndicator, by: NonNullable<DetectionRule['aggregate']>['groupBy']): string {
  if (by === 'value') return it.value;
  if (by === 'source') return it.source;
  if (by === 'reporter') return it.reporter ?? '';
  if (by === 'kind') return it.kind;
  return it.context ?? '';
}

interface CompiledPredicate {
  kinds: EngineIocKind[];
  sources: string[];
  valueRe?: RegExp;
  contextRe?: RegExp;
  reporterRe?: RegExp;
  /** True when no predicate fields are present — guard against an empty
   *  exclude clause silently dropping every match. */
  empty: boolean;
}

function compilePredicate(p: MatchPredicate, kind: 'match' | 'exclude'): CompiledPredicate {
  return {
    kinds: asArray(p.kind),
    sources: asArray(p.source).map((s) => s.toLowerCase()),
    valueRe: p.valueRegex ? compile(p.valueRegex, `${kind}.value`) : undefined,
    contextRe: p.contextRegex ? compile(p.contextRegex, `${kind}.context`) : undefined,
    reporterRe: p.reporterRegex ? compile(p.reporterRegex, `${kind}.reporter`) : undefined,
    empty: !p.kind && !p.source && !p.valueRegex && !p.contextRegex && !p.reporterRegex,
  };
}

function matchesPredicate(it: EngineIndicator, p: CompiledPredicate): boolean {
  if (p.kinds.length > 0 && !p.kinds.includes(it.kind)) return false;
  if (p.sources.length > 0 && !p.sources.includes(it.source.toLowerCase())) return false;
  if (p.valueRe && !p.valueRe.test(it.value)) return false;
  if (p.contextRe && !p.contextRe.test(it.context ?? '')) return false;
  if (p.reporterRe && !p.reporterRe.test(it.reporter ?? '')) return false;
  return true;
}

/** Evaluate one rule against the indicator set. */
function evaluateRule(
  rule: DetectionRule,
  indicators: EngineIndicator[]
): { detections: Detection[]; warning?: string } {
  if (rule.enabled === false) return { detections: [] };

  let matchP: CompiledPredicate;
  let excludeP: CompiledPredicate | undefined;
  try {
    matchP = compilePredicate(rule.match, 'match');
    if (rule.exclude) excludeP = compilePredicate(rule.exclude, 'exclude');
  } catch (e) {
    return { detections: [], warning: e instanceof Error ? e.message : String(e) };
  }

  // Empty exclude clause = nothing to suppress; treat as absent. This
  // prevents `"exclude": {}` from accidentally silencing every match
  // (matchesPredicate returns true for an empty predicate).
  if (excludeP?.empty) excludeP = undefined;

  const matched = indicators.filter((it) => {
    if (!matchesPredicate(it, matchP)) return false;
    if (excludeP && matchesPredicate(it, excludeP)) return false;
    return true;
  });

  if (matched.length === 0) return { detections: [] };

  // ── Aggregate (cross-indicator consensus) ──────────────────────────────
  if (rule.aggregate) {
    const { groupBy, minCount, distinctBy } = rule.aggregate;
    const groups = new Map<string, EngineIndicator[]>();
    for (const it of matched) {
      const k = groupKey(it, groupBy);
      if (k === '') continue; // skip empty group keys (e.g. missing context)
      const bucket = groups.get(k);
      if (bucket) bucket.push(it);
      else groups.set(k, [it]);
    }
    const detections: Detection[] = [];
    for (const [key, members] of groups) {
      const count = distinctBy
        ? new Set(members.map((m) => (m[distinctBy] ?? '').toLowerCase()).filter(Boolean)).size
        : members.length;
      if (count < minCount) continue;
      const { first, last } = observedBounds(members);
      detections.push({
        rule_id: rule.id,
        rule_name: rule.name,
        severity: rule.severity,
        description: rule.description,
        match_count: count,
        group_key: key,
        indicators: members.slice(0, SAMPLE_CAP),
        first_observed: first,
        last_observed: last,
        technique: rule.technique,
        tactic: rule.tactic,
        references: rule.references,
      });
    }
    // Strongest consensus first.
    detections.sort((a, b) => b.match_count - a.match_count);
    return { detections };
  }

  // ── Flat per-rule detection ────────────────────────────────────────────
  if (matched.length < (rule.minMatches ?? 1)) return { detections: [] };
  const { first, last } = observedBounds(matched);
  return {
    detections: [
      {
        rule_id: rule.id,
        rule_name: rule.name,
        severity: rule.severity,
        description: rule.description,
        match_count: matched.length,
        indicators: matched.slice(0, SAMPLE_CAP),
        first_observed: first,
        last_observed: last,
        technique: rule.technique,
        tactic: rule.tactic,
        references: rule.references,
      },
    ],
  };
}

const SEVERITY_RANK: Record<DetectionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function evaluateRules(rules: DetectionRule[], indicators: EngineIndicator[]): EvaluateResult {
  const detections: Detection[] = [];
  const warnings: { rule_id: string; message: string }[] = [];
  for (const rule of rules) {
    const { detections: d, warning } = evaluateRule(rule, indicators);
    if (warning) warnings.push({ rule_id: rule.id, message: warning });
    detections.push(...d);
  }
  detections.sort((a, b) => {
    const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (s !== 0) return s;
    return b.match_count - a.match_count;
  });
  return { detections, warnings };
}
