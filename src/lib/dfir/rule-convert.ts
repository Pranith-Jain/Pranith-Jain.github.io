/**
 * Rule converter — heuristic, any-to-any detection translation.
 *
 * Everything funnels through one intermediate representation (RuleIR):
 *
 *     source text ──parse──▶ RuleIR ──emit──▶ target text
 *
 * Parsers:  Sigma (YAML subset), KQL, Splunk SPL.
 * Emitters: Sigma, KQL, Splunk SPL, Elastic Lucene, Elastic EQL,
 *           YARA (string-extraction), DLP (regex pattern list),
 *           supply-chain (Semgrep-style scaffold + guidance).
 *
 * This is deliberately a *teaching / bootstrap* tool, not pySigma. Field
 * taxonomies are pass-through (repoint names at your schema afterwards) and
 * every lossy step records a warning. KQL/SPL parsing is regex-heuristic and
 * only understands flat `field <op> "value"` predicates joined by and/or.
 * Pure module — no DOM/network — so it is unit-testable in isolation.
 */

export type RuleFormat = 'sigma' | 'kql' | 'splunk' | 'lucene' | 'eql' | 'yara' | 'dlp' | 'supplychain';

export const SOURCE_FORMATS: RuleFormat[] = ['sigma', 'kql', 'splunk'];
export const TARGET_FORMATS: RuleFormat[] = ['sigma', 'kql', 'splunk', 'lucene', 'eql', 'yara', 'dlp', 'supplychain'];

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

/* ════════════════════════ shared helpers ════════════════════════ */

function uniq<T>(a: T[]): T[] {
  return [...new Set(a)];
}

/** Pull every literal string value the IR matches on (for YARA/DLP). */
function allStringValues(ir: RuleIR): string[] {
  const out: string[] = [];
  for (const g of ir.groups) {
    if (g.kind === 'keywords') out.push(...(g.keywords ?? []));
    else for (const p of g.predicates ?? []) out.push(...p.values);
  }
  return uniq(out.map((s) => s.trim()).filter(Boolean));
}

/* ════════════════════════ Sigma parser ════════════════════════ */
/* Indentation-YAML subset — ported from the Sigma converter tool. */

function sigmaScalar(v: string): string | number | boolean {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t !== '' && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

interface YLine {
  indent: number;
  text: string;
}

function yLex(src: string): YLine[] {
  return src
    .split('\n')
    .map((l) => l.replace(/\t/g, '  '))
    .filter((l) => l.trim() !== '' && !/^\s*#/.test(l))
    .map((l) => ({ indent: l.length - l.trimStart().length, text: l.trim() }));
}

function yParse(lines: YLine[], start: number, indent: number): { node: unknown; next: number } {
  if (lines[start] && lines[start]!.text.startsWith('- ') && lines[start]!.indent >= indent) {
    const arr: unknown[] = [];
    let i = start;
    const lvl = lines[start]!.indent;
    while (i < lines.length && lines[i]!.indent === lvl && lines[i]!.text.startsWith('- ')) {
      const rest = lines[i]!.text.slice(2).trim();
      if (rest.includes(':') && !/^["']/.test(rest)) {
        const synth: YLine[] = [{ indent: lvl + 2, text: rest }];
        let j = i + 1;
        while (j < lines.length && lines[j]!.indent > lvl) {
          synth.push(lines[j]!);
          j++;
        }
        const { node } = yParse(synth, 0, lvl + 2);
        arr.push(node);
        i = j;
      } else {
        arr.push(sigmaScalar(rest));
        i++;
      }
    }
    return { node: arr, next: i };
  }
  const obj: Record<string, unknown> = {};
  let i = start;
  const lvl = lines[start] ? lines[start]!.indent : indent;
  while (i < lines.length && lines[i]!.indent === lvl && !lines[i]!.text.startsWith('- ')) {
    const line = lines[i]!.text;
    const ci = line.indexOf(':');
    if (ci === -1) {
      i++;
      continue;
    }
    const key = line.slice(0, ci).trim();
    const val = line.slice(ci + 1).trim();
    if (val === '' || val === '|' || val === '>') {
      if (i + 1 < lines.length && lines[i + 1]!.indent > lvl) {
        const { node, next } = yParse(lines, i + 1, lines[i + 1]!.indent);
        obj[key] = node;
        i = next;
      } else {
        obj[key] = null;
        i++;
      }
    } else if (val.startsWith('[') && val.endsWith(']')) {
      obj[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => sigmaScalar(s))
        .filter((s) => s !== '');
      i++;
    } else {
      obj[key] = sigmaScalar(val);
      i++;
    }
  }
  return { node: obj, next: i };
}

function modToOp(mod: string): { op: MatchOp; all: boolean } {
  if (mod.includes('contains')) return { op: 'contains', all: mod.includes('all') };
  if (mod.includes('startswith')) return { op: 'startswith', all: mod.includes('all') };
  if (mod.includes('endswith')) return { op: 'endswith', all: mod.includes('all') };
  if (mod.includes('re')) return { op: 're', all: false };
  return { op: 'eq', all: mod.includes('all') };
}

function selectionToGroup(name: string, sel: unknown, warnings: string[]): SelectionGroup {
  if (Array.isArray(sel)) {
    return { name, kind: 'keywords', keywords: sel.map(String) };
  }
  if (sel && typeof sel === 'object') {
    const preds: Predicate[] = [];
    for (const [k, v] of Object.entries(sel as Record<string, unknown>)) {
      const [fieldRaw, ...mods] = k.split('|');
      const { op, all } = modToOp(mods.join('|'));
      const values = Array.isArray(v) ? v.map(String) : [String(v)];
      preds.push({ field: fieldRaw!, op, values, all });
    }
    return { name, kind: 'fields', predicates: preds };
  }
  warnings.push(`selection "${name}" had an unsupported shape; treated as a keyword`);
  return { name, kind: 'keywords', keywords: [String(sel)] };
}

function parseSigma(src: string): RuleIR | { error: string } {
  const lines = yLex(src);
  if (lines.length === 0) return { error: 'empty input' };
  const { node } = yParse(lines, 0, lines[0]!.indent);
  const doc = node as Record<string, unknown>;
  const detection = doc.detection as Record<string, unknown> | undefined;
  if (!detection || typeof detection !== 'object') return { error: 'no `detection:` block (is this a Sigma rule?)' };
  const condition = String(detection.condition ?? '');
  if (!condition) return { error: 'no `condition:` inside detection' };
  const warnings: string[] = [];
  const groups: SelectionGroup[] = [];
  for (const [name, sel] of Object.entries(detection)) {
    if (name === 'condition' || name === 'timeframe') continue;
    groups.push(selectionToGroup(name, sel, warnings));
  }
  const ls = (doc.logsource as Record<string, unknown> | undefined) ?? {};
  const meta: Record<string, string> = {};
  for (const k of ['id', 'status', 'author', 'description', 'references', 'tags', 'falsepositives']) {
    if (doc[k] != null) meta[k] = Array.isArray(doc[k]) ? (doc[k] as unknown[]).join(', ') : String(doc[k]);
  }
  return {
    title: doc.title ? String(doc.title) : undefined,
    logsource: {
      product: ls.product ? String(ls.product) : undefined,
      category: ls.category ? String(ls.category) : undefined,
      service: ls.service ? String(ls.service) : undefined,
    },
    groups,
    condition: condition.trim(),
    level: doc.level ? String(doc.level) : undefined,
    meta,
    warnings,
  };
}

/* ════════════════════ KQL / SPL heuristic parsers ════════════════════ */

const KQL_PRED_RE = /([A-Za-z_][\w.]*)\s*(==|=~|!=|contains|startswith|endswith|matches\s+regex|has)\s*"([^"]*)"/gi;

function parseKql(src: string): RuleIR | { error: string } {
  const warnings: string[] = [
    'KQL parsing is heuristic: only flat `Field <op> "value"` predicates are recovered; ' +
      'time windows, joins, summarize, and nested parens are dropped.',
  ];
  const whereIdx = src.search(/\bwhere\b/i);
  const scope = whereIdx >= 0 ? src.slice(whereIdx + 5) : src;
  const preds: Predicate[] = [];
  let m: RegExpExecArray | null;
  KQL_PRED_RE.lastIndex = 0;
  while ((m = KQL_PRED_RE.exec(scope)) !== null) {
    const [, field, rawOp, value] = m;
    const o = rawOp!.toLowerCase().replace(/\s+/g, ' ');
    const op: MatchOp =
      o === 'contains' || o === 'has'
        ? 'contains'
        : o === 'startswith'
          ? 'startswith'
          : o === 'endswith'
            ? 'endswith'
            : o === 'matches regex'
              ? 're'
              : 'eq';
    preds.push({ field: field!, op, values: [value!] });
  }
  if (preds.length === 0) return { error: 'no recognisable `Field <op> "value"` predicates found in the KQL' };
  if (/\bor\b/i.test(scope) && /\band\b/i.test(scope))
    warnings.push('mixed and/or detected — flattened to a single AND-ed selection; review the boolean logic');
  return {
    groups: [{ name: 'selection', kind: 'fields', predicates: preds }],
    condition: 'selection',
    meta: {},
    warnings,
  };
}

const SPL_PRED_RE = /([A-Za-z_][\w.]*)\s*(!=|=)\s*"([^"]*)"/g;

function splValueToPred(field: string, value: string): Predicate {
  const lead = value.startsWith('*');
  const tail = value.endsWith('*');
  const core = value.replace(/^\*+|\*+$/g, '');
  if (lead && tail) return { field, op: 'contains', values: [core] };
  if (tail) return { field, op: 'startswith', values: [core] };
  if (lead) return { field, op: 'endswith', values: [core] };
  return { field, op: 'eq', values: [value] };
}

function parseSplunk(src: string): RuleIR | { error: string } {
  const warnings: string[] = [
    'Splunk SPL parsing is heuristic: `field="value"` (with * wildcards) and `| regex field="..."` ' +
      'are recovered; macros, lookups, stats, and transaction logic are dropped.',
  ];
  const preds: Predicate[] = [];
  let m: RegExpExecArray | null;
  SPL_PRED_RE.lastIndex = 0;
  while ((m = SPL_PRED_RE.exec(src)) !== null) {
    preds.push(splValueToPred(m[1]!, m[3]!));
  }
  const regexRe = /\|\s*regex\s+([A-Za-z_][\w.]*)\s*=\s*"([^"]*)"/g;
  while ((m = regexRe.exec(src)) !== null) {
    preds.push({ field: m[1]!, op: 're', values: [m[2]!] });
  }
  if (preds.length === 0) return { error: 'no recognisable `field="value"` predicates found in the SPL' };
  if (/\bOR\b/.test(src) && /\bAND\b/.test(src))
    warnings.push('mixed AND/OR detected — flattened to a single AND-ed selection; review the boolean logic');
  return {
    groups: [{ name: 'selection', kind: 'fields', predicates: preds }],
    condition: 'selection',
    meta: {},
    warnings,
  };
}

/* ════════════════════════ condition expansion ════════════════════════ */

/** Expand "1 of x*" / "all of them" against group names → parenthesised expr. */
function expandCondition(ir: RuleIR, AND: string, OR: string): string {
  const names = ir.groups.map((g) => g.name);
  return ir.condition
    .replace(/\ball of them\b/gi, `( ${names.join(` ${AND} `)} )`)
    .replace(/\b1 of them\b/gi, `( ${names.join(` ${OR} `)} )`)
    .replace(/\ball of ([\w*]+)\b/gi, (_x, p: string) => {
      const grp = names.filter((n) => n.startsWith(p.replace('*', '')));
      return `( ${(grp.length ? grp : [p]).join(` ${AND} `)} )`;
    })
    .replace(/\b1 of ([\w*]+)\b/gi, (_x, p: string) => {
      const grp = names.filter((n) => n.startsWith(p.replace('*', '')));
      return `( ${(grp.length ? grp : [p]).join(` ${OR} `)} )`;
    });
}

type Lang = 'kql' | 'splunk' | 'lucene' | 'eql';

function esc(v: string, lang: Lang): string {
  if (lang === 'lucene') return v.replace(/(["\\])/g, '\\$1');
  return v.replace(/"/g, '\\"');
}

function predExpr(p: Predicate, lang: Lang): string {
  const join = p.all ? ' AND ' : ' OR ';
  const one = (val: string): string => {
    const v = esc(val, lang);
    const f = p.field;
    if (lang === 'kql') {
      if (p.op === 'contains') return `${f} contains "${v}"`;
      if (p.op === 'startswith') return `${f} startswith "${v}"`;
      if (p.op === 'endswith') return `${f} endswith "${v}"`;
      if (p.op === 're') return `${f} matches regex "${v}"`;
      return `${f} == "${v}"`;
    }
    if (lang === 'splunk') {
      if (p.op === 'contains') return `${f}="*${v}*"`;
      if (p.op === 'startswith') return `${f}="${v}*"`;
      if (p.op === 'endswith') return `${f}="*${v}"`;
      if (p.op === 're') return `${f}=* /* regex: ${v} */`;
      return `${f}="${v}"`;
    }
    if (lang === 'lucene') {
      if (p.op === 'contains') return `${f}:*${v}*`;
      if (p.op === 'startswith') return `${f}:${v}*`;
      if (p.op === 'endswith') return `${f}:*${v}`;
      if (p.op === 're') return `${f}:/${val}/`;
      return `${f}:"${v}"`;
    }
    // eql
    if (p.op === 'contains') return `stringContains(${f}, "${v}")`;
    if (p.op === 'startswith') return `startsWith(${f}, "${v}")`;
    if (p.op === 'endswith') return `endsWith(${f}, "${v}")`;
    if (p.op === 're') return `match(${f}, "${v}")`;
    return `${f} == "${v}"`;
  };
  const parts = p.values.map(one);
  return parts.length === 1 ? parts[0]! : `(${parts.join(join)})`;
}

function groupExpr(g: SelectionGroup, lang: Lang): string {
  if (g.kind === 'keywords') {
    const kws = (g.keywords ?? []).map((k) => {
      const v = esc(k, lang);
      if (lang === 'kql') return `* contains "${v}"`;
      if (lang === 'splunk') return `"${v}"`;
      if (lang === 'lucene') return `"${v}"`;
      return `stringContains(true, "${v}")`; // eql has no free-text; best-effort
    });
    return kws.length === 1 ? kws[0]! : `(${kws.join(' OR ')})`;
  }
  const parts = (g.predicates ?? []).map((p) => predExpr(p, lang));
  return parts.length === 1 ? parts[0]! : `(${parts.join(' AND ')})`;
}

function buildExpr(ir: RuleIR, lang: Lang): string {
  const AND = lang === 'kql' ? 'and' : lang === 'eql' ? 'and' : 'AND';
  const OR = lang === 'kql' ? 'or' : lang === 'eql' ? 'or' : 'OR';
  const NOT = lang === 'kql' ? 'not ' : lang === 'eql' ? 'not ' : 'NOT ';
  const cond = expandCondition(ir, AND, OR);
  const exprOf = (n: string) => {
    const g = ir.groups.find((x) => x.name === n);
    return g ? groupExpr(g, lang) : `/* unknown selection ${n} */`;
  };
  const tokens = cond.match(/\(|\)|\b(?:and|or|not)\b|[\w-]+/gi) ?? [];
  return tokens
    .map((t) => {
      const lt = t.toLowerCase();
      if (t === '(' || t === ')') return t;
      if (lt === 'and') return AND;
      if (lt === 'or') return OR;
      if (lt === 'not') return NOT.trim();
      return exprOf(t);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ════════════════════════ emitters ════════════════════════ */

function emitSigma(ir: RuleIR): string {
  const lines: string[] = [];
  lines.push(`title: ${ir.title ?? 'Converted rule'}`);
  if (ir.meta.id) lines.push(`id: ${ir.meta.id}`);
  lines.push(`status: ${ir.meta.status ?? 'experimental'}`);
  if (ir.meta.description) lines.push(`description: ${ir.meta.description}`);
  const ls = ir.logsource ?? {};
  if (ls.product || ls.category || ls.service) {
    lines.push('logsource:');
    if (ls.product) lines.push(`  product: ${ls.product}`);
    if (ls.category) lines.push(`  category: ${ls.category}`);
    if (ls.service) lines.push(`  service: ${ls.service}`);
  }
  lines.push('detection:');
  for (const g of ir.groups) {
    lines.push(`  ${g.name}:`);
    if (g.kind === 'keywords') {
      for (const k of g.keywords ?? []) lines.push(`    - ${JSON.stringify(k)}`);
    } else {
      for (const p of g.predicates ?? []) {
        const modSuffix = p.op === 'eq' ? '' : `|${p.op}${p.all && p.op !== 're' ? '|all' : ''}`;
        const key = `${p.field}${modSuffix}`;
        if (p.values.length === 1) lines.push(`    ${key}: ${JSON.stringify(p.values[0])}`);
        else {
          lines.push(`    ${key}:`);
          for (const v of p.values) lines.push(`      - ${JSON.stringify(v)}`);
        }
      }
    }
  }
  lines.push(`  condition: ${ir.condition}`);
  lines.push(`level: ${ir.level ?? 'medium'}`);
  return lines.join('\n');
}

function emitKql(ir: RuleIR): string {
  return `union *\n| where ${buildExpr(ir, 'kql')}`;
}
function emitSplunk(ir: RuleIR): string {
  return buildExpr(ir, 'splunk');
}
function emitLucene(ir: RuleIR): string {
  return buildExpr(ir, 'lucene');
}
function emitEql(ir: RuleIR): string {
  const cat = ir.logsource?.category;
  const head =
    cat === 'process_creation' ? 'process where' : cat === 'network_connection' ? 'network where' : 'any where';
  return `${head} ${buildExpr(ir, 'eql')}`;
}

function emitYara(ir: RuleIR, warnings: string[]): string {
  warnings.push(
    'YARA output is a string-extraction heuristic: field/log semantics are lost — it only matches the literal ' +
      'string values from the rule anywhere in a file/buffer. Tune strings + condition before operational use.'
  );
  const values = allStringValues(ir).filter((v) => v.length >= 3 && !/^\d+$/.test(v));
  if (values.length === 0) return '// no extractable string literals for a YARA rule';
  const name = (ir.title ?? 'converted_rule').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
  const strings = values.map((v, i) => `        $s${i + 1} = ${JSON.stringify(v)} nocase`).join('\n');
  // AND when the source condition has no OR and a single fields-group; else any.
  const allOf = !/\bor\b/i.test(ir.condition) && ir.groups.length === 1 && ir.groups[0]!.kind === 'fields';
  return [
    `rule ${name}`,
    '{',
    '    meta:',
    `        description = ${JSON.stringify(ir.meta.description ?? ir.title ?? 'converted from a detection rule')}`,
    '        source = "dfir/rule-converter (heuristic)"',
    '    strings:',
    strings,
    '    condition:',
    `        ${allOf ? 'all' : 'any'} of them`,
    '}',
  ].join('\n');
}

function valueToRegex(v: string, op: MatchOp): string {
  const q = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (op === 're') return v;
  if (op === 'contains') return q;
  if (op === 'startswith') return `^${q}`;
  if (op === 'endswith') return `${q}$`;
  return `^${q}$`;
}

function emitDlp(ir: RuleIR, warnings: string[]): string {
  warnings.push(
    'DLP output is a flat regex pattern list (one per matched value). Boolean structure and field scoping ' +
      'are not represented — wire each pattern into your DLP engine and set the field/channel scope there.'
  );
  const rows: { field: string; pattern: string }[] = [];
  for (const g of ir.groups) {
    if (g.kind === 'keywords')
      for (const k of g.keywords ?? []) rows.push({ field: '*', pattern: valueToRegex(k, 'contains') });
    else
      for (const p of g.predicates ?? [])
        for (const v of p.values) rows.push({ field: p.field, pattern: valueToRegex(v, p.op) });
  }
  if (rows.length === 0) return '// no values to derive DLP patterns from';
  return JSON.stringify(
    {
      name: ir.title ?? 'Converted DLP ruleset',
      match: 'any',
      patterns: rows.map((r, i) => ({ id: `p${i + 1}`, field: r.field, regex: r.pattern })),
    },
    null,
    2
  );
}

function emitSupplyChain(ir: RuleIR, warnings: string[]): string {
  warnings.push(
    'Supply-chain output is a Semgrep-style scaffold + guidance, NOT a faithful transpile. Detection-rule ' +
      'semantics rarely map onto dependency/code scanning — treat this as a starting point and validate against ' +
      'Guarddog / OSV-Scanner / Semgrep directly.'
  );
  const values = allStringValues(ir);
  const patterns = values
    .slice(0, 12)
    .map((v) => `      - pattern-regex: ${JSON.stringify(valueToRegex(v, 'contains'))}`);
  return [
    '# Semgrep scaffold (heuristic) — review before use.',
    '#   • For malicious-package detection use DataDog Guarddog.',
    '#   • For known-vuln dependencies use Google OSV-Scanner.',
    'rules:',
    `  - id: ${(ir.title ?? 'converted-rule').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    `    message: ${JSON.stringify(ir.meta.description ?? ir.title ?? 'converted from a detection rule')}`,
    '    severity: WARNING',
    '    languages: [generic]',
    '    patterns:',
    ...(patterns.length ? patterns : ['      - pattern-regex: "TODO-no-literals-extracted"']),
  ].join('\n');
}

/* ════════════════════════ public API ════════════════════════ */

export function convertRule(src: string, from: RuleFormat, to: RuleFormat): ConvertResult {
  if (!src.trim()) return { ok: false, error: 'empty input' };
  if (!SOURCE_FORMATS.includes(from))
    return { ok: false, error: `${FORMAT_LABELS[from]} is output-only — pick Sigma, KQL, or Splunk as the source` };

  let ir: RuleIR | { error: string };
  if (from === 'sigma') ir = parseSigma(src);
  else if (from === 'kql') ir = parseKql(src);
  else ir = parseSplunk(src);
  if ('error' in ir) return { ok: false, error: ir.error };

  const warnings = [...ir.warnings];
  if (from !== 'sigma') warnings.unshift(`${FORMAT_LABELS[from]} → IR is heuristic; verify the result.`);

  try {
    let output: string;
    switch (to) {
      case 'sigma':
        output = emitSigma(ir);
        break;
      case 'kql':
        output = emitKql(ir);
        break;
      case 'splunk':
        output = emitSplunk(ir);
        break;
      case 'lucene':
        output = emitLucene(ir);
        break;
      case 'eql':
        output = emitEql(ir);
        warnings.push('EQL output omits sequence/time logic; it is a single-event `… where` expression.');
        break;
      case 'yara':
        output = emitYara(ir, warnings);
        break;
      case 'dlp':
        output = emitDlp(ir, warnings);
        break;
      case 'supplychain':
        output = emitSupplyChain(ir, warnings);
        break;
      default:
        return { ok: false, error: `unknown target format` };
    }
    return { ok: true, output, warnings: uniq(warnings) };
  } catch (e) {
    return { ok: false, error: `conversion failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
