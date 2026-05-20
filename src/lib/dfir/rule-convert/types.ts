/**
 * Shared types + lookup tables for the rule converter.
 *
 * One intermediate representation (RuleIR) sits between the parsers and the
 * emitters. Keep this file purely declarative — no parsing, no emitting,
 * no I/O — so the rest of the module tree can import from it freely without
 * pulling in either side's logic.
 */

export type RuleFormat = 'sigma' | 'kql' | 'splunk' | 'lucene' | 'eql' | 'yara' | 'dlp' | 'supplychain';

export const TARGET_FORMATS: RuleFormat[] = ['sigma', 'kql', 'splunk', 'lucene', 'eql', 'yara', 'dlp', 'supplychain'];
// Universal: every format is both a source and a target. Parsing the query /
// rule languages back into the IR is heuristic (flagged at runtime).
export const SOURCE_FORMATS: RuleFormat[] = TARGET_FORMATS;

export const FORMAT_LABELS: Record<RuleFormat, string> = {
  sigma: 'Sigma (YAML)',
  kql: 'Microsoft KQL',
  splunk: 'Splunk SPL',
  lucene: 'Elastic Lucene',
  eql: 'Elastic EQL',
  yara: 'YARA',
  dlp: 'DLP regex patterns',
  supplychain: 'Supply-chain (Semgrep scaffold)',
};

export type MatchOp = 'eq' | 'contains' | 'startswith' | 'endswith' | 're';

export interface Predicate {
  field: string;
  op: MatchOp;
  /** OR-ed values unless `all` is set (then AND-ed). */
  values: string[];
  all?: boolean;
}

export interface SelectionGroup {
  name: string;
  kind: 'fields' | 'keywords';
  predicates?: Predicate[];
  keywords?: string[];
}

export interface RuleIR {
  title?: string;
  logsource?: { product?: string; category?: string; service?: string };
  groups: SelectionGroup[];
  /** Boolean expression over group names; `and`/`or`/`not`/parens. */
  condition: string;
  level?: string;
  meta: Record<string, string>;
  warnings: string[];
}

export type ConvertResult = { ok: true; output: string; warnings: string[] } | { ok: false; error: string };

/* ── small shared helpers used by both parsers and emitters ─────────────── */

export function uniq<T>(a: T[]): T[] {
  return [...new Set(a)];
}

/** Pull every literal string value the IR matches on (for YARA/DLP/supplychain). */
export function allStringValues(ir: RuleIR): string[] {
  const out: string[] = [];
  for (const g of ir.groups) {
    if (g.kind === 'keywords') out.push(...(g.keywords ?? []));
    else for (const p of g.predicates ?? []) out.push(...p.values);
  }
  return uniq(out.map((s) => s.trim()).filter(Boolean));
}

/** Map a `*`-bracketed Splunk/Lucene value to a contains/startswith/endswith/eq predicate. */
export function wildcardToPred(field: string, raw: string): Predicate {
  const lead = raw.startsWith('*');
  const tail = raw.endsWith('*');
  const core = raw.replace(/^\*+|\*+$/g, '');
  if (lead && tail) return { field, op: 'contains', values: [core] };
  if (tail) return { field, op: 'startswith', values: [core] };
  if (lead) return { field, op: 'endswith', values: [core] };
  return { field, op: 'eq', values: [raw] };
}
