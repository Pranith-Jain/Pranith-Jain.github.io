/**
 * Emitters for each RuleFormat from RuleIR.
 *
 * Query-language emitters (KQL / SPL / Lucene / EQL) share a single
 * `buildExpr` driver that walks the IR's `condition` expression and
 * substitutes each selection name with its rendered group. Sigma / YARA /
 * DLP / supply-chain emitters render structured documents directly.
 *
 * YARA / DLP / supply-chain are inherently lossy (no field semantics);
 * they each push a heuristic warning onto the caller-owned array.
 */

import { allStringValues, type MatchOp, type Predicate, type RuleIR, type SelectionGroup } from './types';

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

export function emitSigma(ir: RuleIR): string {
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

export function emitKql(ir: RuleIR): string {
  return `union *\n| where ${buildExpr(ir, 'kql')}`;
}
export function emitSplunk(ir: RuleIR): string {
  return buildExpr(ir, 'splunk');
}
export function emitLucene(ir: RuleIR): string {
  return buildExpr(ir, 'lucene');
}
export function emitEql(ir: RuleIR): string {
  const cat = ir.logsource?.category;
  const head =
    cat === 'process_creation' ? 'process where' : cat === 'network_connection' ? 'network where' : 'any where';
  return `${head} ${buildExpr(ir, 'eql')}`;
}

export function emitYara(ir: RuleIR, warnings: string[]): string {
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

export function emitDlp(ir: RuleIR, warnings: string[]): string {
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

/**
 * Snort / Suricata emitter.
 *
 * Snort 2/3 and Suricata share the rule grammar (`alert <proto> <src> ->
 * <dst> (msg:"…"; content:"…"; sid:N; rev:N;)`) so a single emitter
 * serves both. We translate every literal value the IR matches on into a
 * `content:` clause and AND them by default; if the IR uses `or` we drop
 * to `pcre:` alternation for a single `content` line so the rule still
 * fires on any match.
 */
export function emitSnort(ir: RuleIR, warnings: string[]): string {
  warnings.push(
    'Snort/Suricata output is a content/pcre scaffold — host-log field semantics do not exist in NIDS rules. ' +
      'Validate the proto / direction / sid; tune classtype + reference before deploying.'
  );
  const values = allStringValues(ir).filter((v) => v.length >= 3);
  if (values.length === 0) return '# no string values to derive Snort/Suricata content rules';
  const title = (ir.meta.description ?? ir.title ?? 'converted-rule').replace(/"/g, '\\"');
  // Stable-ish sid in the local-rule range (1_000_000–1_999_999).
  const sid = 1_000_000 + (Math.abs([...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 999_999);
  const useOr = /\bor\b/i.test(ir.condition) && values.length > 1;
  const escape = (v: string) => v.replace(/[\\|]/g, '\\$&');
  const body = useOr
    ? `pcre:"/(?i)(${values.map(escape).join('|')})/";`
    : values.map((v) => `content:"${v.replace(/"/g, '\\"')}"; nocase;`).join(' ');
  return `# Converted from a detection rule via /dfir/rule-converter (heuristic).\n# Adjust proto/direction/classtype before operational use.\nalert tcp any any -> $HOME_NET any (msg:"${title}"; ${body} classtype:trojan-activity; sid:${sid}; rev:1;)`;
}

/**
 * PowerShell emitter — produces a `Select-String -Pattern …` one-liner
 * that scans the EventLog / file system for the IR's literal values.
 * This is a triage helper, not a hardened detection — it's what an IR
 * tier-1 would paste into a Windows host to confirm/deny the rule's
 * substrate before promoting it to a SIEM detection.
 */
export function emitPowerShell(ir: RuleIR, warnings: string[]): string {
  warnings.push(
    'PowerShell output is a triage one-liner (Select-String over EventLogs / files). ' +
      'Field semantics are not preserved — review what surface you are scanning before running.'
  );
  const values = allStringValues(ir).filter((v) => v.length >= 3);
  if (values.length === 0) return '# no string values to derive a PowerShell scanner from';
  const escape = (v: string) => v.replace(/[\\.+*?^$(){}|[\]]/g, '\\$&');
  const pattern = values.map(escape).join('|');
  const title = ir.title ?? 'converted detection';
  return [
    `# Converted from "${title}" via /dfir/rule-converter (triage helper).`,
    `# Adjust -LogName / file scope before running on a production host.`,
    `$pattern = '(${pattern})'`,
    `Get-WinEvent -LogName 'Microsoft-Windows-Sysmon/Operational' -MaxEvents 5000 |`,
    `  Where-Object { $_.Message -match $pattern } |`,
    `  Select-Object TimeCreated, Id, MachineName, @{n='Match';e={ ($_.Message -split "\`n" | Where-Object { $_ -match $pattern }) -join '; ' }} |`,
    `  Format-Table -AutoSize`,
  ].join('\n');
}

export function emitSupplyChain(ir: RuleIR, warnings: string[]): string {
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
    ...(patterns.length ? patterns : ['      # No extractable string literals found; review manually.']),
  ].join('\n');
}
