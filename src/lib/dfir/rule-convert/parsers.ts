/**
 * Parsers for each RuleFormat → RuleIR.
 *
 * Sigma is parsed via a small indentation-YAML lexer (the subset needed for
 * a real-world `detection:` block). Every other parser is regex-heuristic
 * and recovers only flat `field <op> "value"` predicates + string literals,
 * plus a top-level warning describing what was dropped. Failures return
 * `{ error }` instead of throwing so the caller can surface a clean message.
 *
 * `!=` is deliberately not parsed back to an `eq` predicate — the IR has no
 * negated-predicate op, so capturing it would silently flip negation to
 * equality. We detect its presence and emit a warning instead.
 */

import { uniq, wildcardToPred, type MatchOp, type Predicate, type RuleIR, type SelectionGroup } from './types';

/* ════════════════════════ Sigma (YAML subset) ════════════════════════ */

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

export function parseSigma(src: string): RuleIR | { error: string } {
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

/* ════════════════════════ KQL / Splunk SPL ════════════════════════ */

// `!=` is intentionally excluded — see the module header.
const KQL_PRED_RE = /([A-Za-z_][\w.]*)\s*(==|=~|contains|startswith|endswith|matches\s+regex|has)\s*"([^"]*)"/gi;
const NEG_OP_RE = /!=\s*"[^"]*"|\bnot\s+\(/i;

export function parseKql(src: string): RuleIR | { error: string } {
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
  if (NEG_OP_RE.test(scope))
    warnings.push('negation (`!=` / `not (…)`) detected — not interpreted by the IR; re-add it on the target by hand');
  return {
    groups: [{ name: 'selection', kind: 'fields', predicates: preds }],
    condition: 'selection',
    meta: {},
    warnings,
  };
}

const SPL_PRED_RE = /([A-Za-z_][\w.]*)\s*=\s*"([^"]*)"/g;
const SPL_NEG_RE = /!=\s*"[^"]*"|\bNOT\s+/;

function splValueToPred(field: string, value: string): Predicate {
  const lead = value.startsWith('*');
  const tail = value.endsWith('*');
  const core = value.replace(/^\*+|\*+$/g, '');
  if (lead && tail) return { field, op: 'contains', values: [core] };
  if (tail) return { field, op: 'startswith', values: [core] };
  if (lead) return { field, op: 'endswith', values: [core] };
  return { field, op: 'eq', values: [value] };
}

export function parseSplunk(src: string): RuleIR | { error: string } {
  const warnings: string[] = [
    'Splunk SPL parsing is heuristic: `field="value"` (with * wildcards) and `| regex field="..."` ' +
      'are recovered; macros, lookups, stats, and transaction logic are dropped.',
  ];
  const preds: Predicate[] = [];
  let m: RegExpExecArray | null;
  SPL_PRED_RE.lastIndex = 0;
  while ((m = SPL_PRED_RE.exec(src)) !== null) {
    preds.push(splValueToPred(m[1]!, m[2]!));
  }
  const regexRe = /\|\s*regex\s+([A-Za-z_][\w.]*)\s*=\s*"([^"]*)"/g;
  while ((m = regexRe.exec(src)) !== null) {
    preds.push({ field: m[1]!, op: 're', values: [m[2]!] });
  }
  if (preds.length === 0) return { error: 'no recognisable `field="value"` predicates found in the SPL' };
  if (/\bOR\b/.test(src) && /\bAND\b/.test(src))
    warnings.push('mixed AND/OR detected — flattened to a single AND-ed selection; review the boolean logic');
  if (SPL_NEG_RE.test(src))
    warnings.push('negation (`!=` / `NOT`) detected — not interpreted by the IR; re-add it on the target by hand');
  return {
    groups: [{ name: 'selection', kind: 'fields', predicates: preds }],
    condition: 'selection',
    meta: {},
    warnings,
  };
}

/* ════════════════════════ Lucene / EQL ════════════════════════ */

// field:"v" | field:v* | field:*v* | field:/re/ | bare "keyword"
const LUCENE_PRED_RE = /([A-Za-z_][\w.]*)\s*:\s*(?:"([^"]*)"|\/([^/]+)\/|([^\s()]+))/g;

export function parseLucene(src: string): RuleIR | { error: string } {
  const warnings = [
    'Lucene parsing is heuristic: `field:value` (with * wildcards) and `field:/regex/` are recovered; ' +
      'boosting, ranges, fuzzy/proximity and nested grouping are dropped.',
  ];
  const preds: Predicate[] = [];
  const keywords: string[] = [];
  let m: RegExpExecArray | null;
  LUCENE_PRED_RE.lastIndex = 0;
  while ((m = LUCENE_PRED_RE.exec(src)) !== null) {
    const field = m[1]!;
    if (m[3] !== undefined) preds.push({ field, op: 're', values: [m[3]] });
    else {
      const raw = m[2] ?? m[4] ?? '';
      if (raw.includes('*')) preds.push(wildcardToPred(field, raw));
      else preds.push({ field, op: 'eq', values: [raw] });
    }
  }
  for (const km of src.matchAll(/(?<![\w:])"([^"]+)"/g)) {
    const idx = km.index ?? 0;
    if (src[idx - 1] === ':') continue;
    keywords.push(km[1]!);
  }
  if (preds.length === 0 && keywords.length === 0)
    return { error: 'no recognisable `field:value` predicates found in the Lucene query' };
  const groups: SelectionGroup[] = [];
  if (preds.length) groups.push({ name: 'selection', kind: 'fields', predicates: preds });
  if (keywords.length) groups.push({ name: 'keywords', kind: 'keywords', keywords: uniq(keywords) });
  return {
    groups,
    condition: groups.map((g) => g.name).join(' and '),
    meta: {},
    warnings,
  };
}

const EQL_HEAD_RE = /^\s*(\w+)\s+where\b/i;
const EQL_FN_RE =
  /\b(stringContains|startsWith|endsWith|match|wildcard|cidrMatch)\s*\(\s*([\w.]+)\s*,\s*"([^"]*)"\s*\)/g;
const EQL_EQ_RE = /([\w.]+)\s*(==|:|like|regex)\s*"([^"]*)"/g;

export function parseEql(src: string): RuleIR | { error: string } {
  const warnings = [
    'EQL parsing is heuristic: single-event `… where` comparisons and string functions are recovered; ' +
      'sequence/sample/join pipelines and time windows are dropped.',
  ];
  const head = EQL_HEAD_RE.exec(src);
  const category =
    head && /^process$/i.test(head[1]!)
      ? 'process_creation'
      : head && /^network$/i.test(head[1]!)
        ? 'network_connection'
        : undefined;
  const preds: Predicate[] = [];
  let m: RegExpExecArray | null;
  EQL_FN_RE.lastIndex = 0;
  while ((m = EQL_FN_RE.exec(src)) !== null) {
    const fn = m[1]!.toLowerCase();
    const op: MatchOp =
      fn === 'stringcontains' || fn === 'wildcard'
        ? 'contains'
        : fn === 'startswith'
          ? 'startswith'
          : fn === 'endswith'
            ? 'endswith'
            : 're';
    preds.push({ field: m[2]!, op, values: [m[3]!] });
  }
  EQL_EQ_RE.lastIndex = 0;
  while ((m = EQL_EQ_RE.exec(src)) !== null) {
    const o = m[2]!.toLowerCase();
    preds.push({ field: m[1]!, op: o === 'regex' ? 're' : o === 'like' ? 'contains' : 'eq', values: [m[3]!] });
  }
  if (preds.length === 0) return { error: 'no recognisable `field == "value"` comparisons found in the EQL' };
  return {
    logsource: category ? { category } : undefined,
    groups: [{ name: 'selection', kind: 'fields', predicates: preds }],
    condition: 'selection',
    meta: {},
    warnings,
  };
}

/* ════════════════════════ YARA / DLP / supply-chain ════════════════════════ */

const YARA_TEXT_STR_RE = /\$[\w]*\s*=\s*"((?:[^"\\]|\\.)*)"/g;
const YARA_REGEX_STR_RE = /\$[\w]*\s*=\s*\/((?:[^/\\]|\\.)+)\//g;

export function parseYara(src: string): RuleIR | { error: string } {
  const warnings = [
    'YARA parsing is heuristic: string literals become keywords and regex strings become regex predicates. ' +
      'Hex strings, string modifiers, and the boolean `condition:` (counts, offsets, "N of") are NOT evaluated.',
  ];
  const nameM = /\brule\s+([A-Za-z_]\w*)/.exec(src);
  const keywords: string[] = [];
  const preds: Predicate[] = [];
  let m: RegExpExecArray | null;
  YARA_TEXT_STR_RE.lastIndex = 0;
  while ((m = YARA_TEXT_STR_RE.exec(src)) !== null) keywords.push(m[1]!.replace(/\\(.)/g, '$1'));
  YARA_REGEX_STR_RE.lastIndex = 0;
  while ((m = YARA_REGEX_STR_RE.exec(src)) !== null) preds.push({ field: '*', op: 're', values: [m[1]!] });
  if (keywords.length === 0 && preds.length === 0) return { error: 'no string definitions found in the YARA rule' };
  const groups: SelectionGroup[] = [];
  if (keywords.length) groups.push({ name: 'strings', kind: 'keywords', keywords: uniq(keywords) });
  if (preds.length) groups.push({ name: 'patterns', kind: 'fields', predicates: preds });
  const descM = /description\s*=\s*"([^"]*)"/i.exec(src);
  return {
    title: nameM ? nameM[1] : undefined,
    groups,
    // YARA default is "any of them"; mirror with OR across groups.
    condition: groups.map((g) => g.name).join(/\ball of them\b/i.test(src) ? ' and ' : ' or '),
    meta: descM ? { description: descM[1]! } : {},
    warnings,
  };
}

export function parseDlp(src: string): RuleIR | { error: string } {
  const warnings = ['DLP parsing reads the pattern list back as regex predicates; the `match` mode is informational.'];
  let doc: unknown;
  try {
    doc = JSON.parse(src);
  } catch {
    return { error: 'DLP source must be the JSON pattern list emitted by this tool' };
  }
  const d = doc as { name?: string; patterns?: { field?: string; regex?: string }[] };
  if (!Array.isArray(d.patterns) || d.patterns.length === 0) return { error: 'no `patterns[]` array in the DLP JSON' };
  const preds: Predicate[] = d.patterns
    .filter((p) => p.regex)
    .map((p) => ({ field: p.field || '*', op: 're' as MatchOp, values: [p.regex!] }));
  return {
    title: d.name,
    groups: [{ name: 'selection', kind: 'fields', predicates: preds }],
    condition: 'selection',
    meta: {},
    warnings,
  };
}

export function parseSupplychain(src: string): RuleIR | { error: string } {
  const warnings = [
    'Supply-chain parsing only recovers the `pattern-regex:` lines from a Semgrep-style scaffold — ' +
      'languages, metavariables, and pattern composition are not interpreted.',
  ];
  const preds: Predicate[] = [];
  for (const m of src.matchAll(/pattern-regex:\s*"((?:[^"\\]|\\.)*)"/g)) {
    preds.push({ field: '*', op: 're', values: [m[1]!.replace(/\\(.)/g, '$1')] });
  }
  if (preds.length === 0) return { error: 'no `pattern-regex:` entries found in the supply-chain scaffold' };
  const idM = /\bid:\s*([^\n]+)/.exec(src);
  const msgM = /\bmessage:\s*"?([^"\n]+)"?/.exec(src);
  return {
    title: idM ? idM[1]!.trim() : undefined,
    groups: [{ name: 'selection', kind: 'fields', predicates: preds }],
    condition: 'selection',
    meta: msgM ? { description: msgM[1]!.trim() } : {},
    warnings,
  };
}
