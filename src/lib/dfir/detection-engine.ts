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

export interface DetectionRule {
  id: string;
  name: string;
  severity: DetectionSeverity;
  description?: string;
  enabled?: boolean;
  /** Every provided predicate must hold for an indicator to match. */
  match: {
    kind?: EngineIocKind | EngineIocKind[];
    /** Exact feed source id(s) — e.g. "c2-intel", "threatfox". */
    source?: string | string[];
    /** Case-insensitive regex tested against the indicator value. */
    valueRegex?: string;
    /** Case-insensitive regex tested against the context string. */
    contextRegex?: string;
    /** Case-insensitive regex tested against the reporter string. */
    reporterRegex?: string;
  };
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

/** Evaluate one rule against the indicator set. */
function evaluateRule(
  rule: DetectionRule,
  indicators: EngineIndicator[]
): { detections: Detection[]; warning?: string } {
  if (rule.enabled === false) return { detections: [] };

  let valueRe: RegExp | undefined;
  let contextRe: RegExp | undefined;
  let reporterRe: RegExp | undefined;
  try {
    if (rule.match.valueRegex) valueRe = compile(rule.match.valueRegex, 'value');
    if (rule.match.contextRegex) contextRe = compile(rule.match.contextRegex, 'context');
    if (rule.match.reporterRegex) reporterRe = compile(rule.match.reporterRegex, 'reporter');
  } catch (e) {
    return { detections: [], warning: e instanceof Error ? e.message : String(e) };
  }

  const kinds = asArray(rule.match.kind);
  const sources = asArray(rule.match.source).map((s) => s.toLowerCase());

  const matched = indicators.filter((it) => {
    if (kinds.length > 0 && !kinds.includes(it.kind)) return false;
    if (sources.length > 0 && !sources.includes(it.source.toLowerCase())) return false;
    if (valueRe && !valueRe.test(it.value)) return false;
    if (contextRe && !contextRe.test(it.context ?? '')) return false;
    if (reporterRe && !reporterRe.test(it.reporter ?? '')) return false;
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
