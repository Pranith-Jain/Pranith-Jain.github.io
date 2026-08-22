/**
 * Detection-rule toolkit — validation + conversion for YARA, Sigma,
 * osquery and Suricata/Snort rules (pure functions, no network).
 *
 * Static lints only — a real YARA compiler pass is out of scope on the
 * edge, but the checks here catch the majority of AI-generated rule
 * breakage: unbalanced braces, dangling string refs, malformed Sigma
 * detection blocks, non-read-only osquery SQL, malformed Suricata headers.
 */
import { load } from 'js-yaml';

// ── Shared types ───────────────────────────────────────────────────────────

export interface LineIssue {
  line?: number;
  message: string;
}

export interface YaraValidationResult {
  valid: boolean;
  rules: number;
  errors: LineIssue[];
  warnings: LineIssue[];
}

export interface SigmaSummary {
  title: string;
  id?: string;
  level?: string;
  status?: string;
  tags: string[];
  logsource: Record<string, unknown>;
}

export interface SigmaValidationResult {
  valid: boolean;
  errors: LineIssue[];
  warnings: LineIssue[];
  rule?: SigmaSummary;
}

export interface ConversionResult {
  ok: boolean;
  query: string;
  target: 'splunk' | 'kql';
  warnings: string[];
  error?: string;
}

export interface OsqueryValidationResult {
  valid: boolean;
  errors: LineIssue[];
  warnings: LineIssue[];
  tables: string[];
}

export interface SuricataParsed {
  action: string;
  protocol: string;
  sid?: number;
  rev?: number;
  msg?: string;
}

export interface SuricataValidationResult {
  valid: boolean;
  errors: LineIssue[];
  warnings: LineIssue[];
  parsed?: SuricataParsed;
}

export type RuleKind = 'yara' | 'sigma' | 'suricata' | 'snort' | 'osquery';

// ── YARA ───────────────────────────────────────────────────────────────────

const YARA_RULE_RE = /\brule\s+([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Walk source tracking YARA lexical states; visit() sees every char that is
 * code (not inside "strings", // or /* comments, or /regex/ literals).
 * YARA has no division operator, so a bare `/` in code position always
 * starts a regex literal (or comment, handled first).
 */
function walkYaraCode(source: string, visit: (ch: string, idx: number) => void): void {
  const n = source.length;
  let mode: 'code' | 'dquote' | 'line_comment' | 'block_comment' | 'regex' = 'code';
  let i = 0;
  while (i < n) {
    const ch = source.charAt(i);
    const next = i + 1 < n ? source.charAt(i + 1) : '';
    if (mode === 'code') {
      if (ch === '/' && next === '/') {
        mode = 'line_comment';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        mode = 'block_comment';
        i += 2;
        continue;
      }
      if (ch === '"') {
        mode = 'dquote';
        i++;
        continue;
      }
      if (ch === '/') {
        mode = 'regex';
        i++;
        continue;
      }
      visit(ch, i);
      i++;
      continue;
    }
    if (mode === 'dquote') {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '"') {
        mode = 'code';
      }
      i++;
      continue;
    }
    if (mode === 'regex') {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '/' || ch === '\n') {
        mode = 'code';
      }
      i++;
      continue;
    }
    if (mode === 'line_comment') {
      if (ch === '\n') {
        mode = 'code';
      }
      i++;
      continue;
    }
    // block_comment
    if (ch === '*' && next === '/') {
      mode = 'code';
      i += 2;
      continue;
    }
    i++;
  }
}

/** Brace-match from a known opening '{' index; returns index of its '}' or -1. */
function matchYaraBrace(source: string, openIdx: number): number {
  const stack: number[] = [];
  let found = -1;
  walkYaraCode(source, (ch, idx) => {
    if (found >= 0) return;
    if (idx < openIdx) return;
    if (ch === '{') stack.push(idx);
    else if (ch === '}') {
      stack.pop();
      if (stack.length === 0) found = idx;
    }
  });
  return found;
}

/** Global brace balance check across the whole source. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function yaraBraceIssues(source: string): LineIssue[] {
  const issues: LineIssue[] = [];
  let depth = 0;
  let line = 1;
  walkYaraCode(source, (ch, idx) => {
    // count lines lazily up to idx
    while (line < source.length && idx >= lineIndexOf(source, line + 1)) line++;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth < 0) {
        issues.push({ line, message: 'unbalanced closing brace }' });
        depth = 0; // resync
      }
    }
  });
  if (depth > 0) issues.push({ message: `${depth} unclosed brace(s) at end of input` });
  return issues;
}

const LINE_INDEX_CACHE = new Map<string, number[]>();
function lineIndexOf(source: string, line: number): number {
  let arr = LINE_INDEX_CACHE.get(source);
  if (!arr) {
    arr = [0];
    for (let i = 0; i < source.length; i++) {
      if (source.charAt(i) === '\n') arr.push(i + 1);
    }
    LINE_INDEX_CACHE.set(source, arr);
  }
  return line < arr.length ? arr[line]! : source.length + 1;
}

interface YaraSectionPos {
  meta?: number;
  strings?: number;
  condition?: number;
}

function extractYaraBodies(source: string): Array<{ name: string; body: string; startLine: number }> {
  const bodies: Array<{ name: string; body: string; startLine: number }> = [];
  YARA_RULE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = YARA_RULE_RE.exec(source)) !== null) {
    const name = m[1]!;
    // find opening brace after header (skip tags)
    const open = source.indexOf('{', m.index + m[0].length);
    if (open < 0) break;
    const close = matchYaraBrace(source, open);
    if (close < 0) break;
    bodies.push({ name, body: source.slice(open + 1, close), startLine: lineOfIndex(source, m.index) });
    YARA_RULE_RE.lastIndex = close + 1;
  }
  return bodies;
}

function lineOfIndex(source: string, idx: number): number {
  return source.slice(0, idx).split('\n').length;
}

function validateYaraHexStrings(body: string, baseLine: number, errors: LineIssue[]): void {
  const HEX_RE = /\$[A-Za-z0-9_]+\s*=\s*\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = HEX_RE.exec(body)) !== null) {
    const tokens = m[1]!
      .trim()
      .split(/\s+/)
      .filter((t) => t !== '' && t !== '-' && t !== '|');
    for (const t of tokens) {
      if (!/^\?\?|[0-9A-Fa-f]{2}$/.test(t)) {
        errors.push({ line: baseLine, message: `malformed hex-string token "${t}"` });
      }
    }
  }
}

export function validateYaraRule(source: string): YaraValidationResult {
  const errors: LineIssue[] = [];
  const warnings: LineIssue[] = [];

  if (!source || !source.trim()) {
    return { valid: false, rules: 0, errors: [{ message: 'empty rule source' }], warnings };
  }

  // Global structure scan — but only outside any string/comment/regex.
  let depth = 0;
  const balanceIssues: LineIssue[] = [];
  walkYaraCode(source, () => {}); // sanity: scanner terminates
  {
    // reimplement inline to track depth+lines together
    const n = source.length;
    let mode: 'code' | 'dquote' | 'lc' | 'bc' | 're' = 'code';
    let i = 0;
    while (i < n) {
      const ch = source.charAt(i);
      const next = i + 1 < n ? source.charAt(i + 1) : '';
      if (mode === 'code') {
        if (ch === '/' && next === '/') {
          mode = 'lc';
          i += 2;
          continue;
        }
        if (ch === '/' && next === '*') {
          mode = 'bc';
          i += 2;
          continue;
        }
        if (ch === '"') {
          mode = 'dquote';
          i++;
          continue;
        }
        if (ch === '/') {
          mode = 're';
          i++;
          continue;
        }
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth < 0) {
            balanceIssues.push({ line: lineOfIndex(source, i), message: 'unbalanced closing brace }' });
            depth = 0;
          }
        }
        i++;
        continue;
      }
      if (mode === 'dquote') {
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === '"') mode = 'code';
        i++;
        continue;
      }
      if (mode === 're') {
        if (ch === '\\') {
          i += 2;
          continue;
        }
        if (ch === '/' || ch === '\n') mode = 'code';
        i++;
        continue;
      }
      if (mode === 'lc') {
        if (ch === '\n') mode = 'code';
        i++;
        continue;
      }
      // bc
      if (ch === '*' && next === '/') {
        mode = 'code';
        i += 2;
        continue;
      }
      i++;
    }
  }
  if (depth > 0) balanceIssues.push({ message: `${depth} unclosed brace(s) at end of input` });
  errors.push(...balanceIssues);

  const bodies = extractYaraBodies(source);

  if (bodies.length === 0 && balanceIssues.length === 0) {
    errors.push({ message: 'no `rule <name> { ... }` declaration found' });
  }

  // duplicate names
  const seen = new Map<string, number>();
  for (const b of bodies) seen.set(b.name, (seen.get(b.name) ?? 0) + 1);
  for (const [name, count] of seen) {
    if (count > 1) errors.push({ message: `duplicate rule name "${name}" (${count}x)` });
  }

  for (const b of bodies) {
    // section positions
    const secRe = /(?:^|\n)\s*(meta|strings|condition)\s*:/g;
    const secs: YaraSectionPos = {};
    let sm: RegExpExecArray | null;
    while ((sm = secRe.exec(b.body)) !== null) {
      const raw = sm[1]!;
      const key = raw as keyof YaraSectionPos;
      secs[key] = sm.index + sm[0].indexOf(raw);
    }
    if (secs.condition === undefined) {
      errors.push({ line: b.startLine, message: `rule "${b.name}": missing condition: section` });
      continue;
    }
    // slice section texts
    const ordered: Array<[keyof YaraSectionPos, number]> = (['meta', 'strings', 'condition'] as const)
      .filter((k) => secs[k] !== undefined)
      .map((k) => [k, secs[k]!] as [keyof YaraSectionPos, number])
      .sort((a, b) => a[1] - b[1]);
    const textOf = (k: keyof YaraSectionPos): string => {
      const idx = ordered.findIndex(([kk]) => kk === k);
      if (idx < 0) return '';
      const start = ordered[idx]![1] + k.length + 1;
      const end = idx + 1 < ordered.length ? ordered[idx + 1]![1] : b.body.length;
      return b.body.slice(start, end);
    };

    const definedIds = new Set<string>();
    if (secs.strings !== undefined) {
      const strText = textOf('strings');
      const defRe = /^\s*([$#][A-Za-z0-9_*]+)\s*=/gm;
      let dm: RegExpExecArray | null;
      while ((dm = defRe.exec(strText)) !== null) definedIds.add(dm[1]!.slice(1));
      validateYaraHexStrings(strText, b.startLine, errors);
      // regex strings must start with /
      {
        const valRe = /^\s*\$([A-Za-z0-9_]+)\s*=\s*(.+)/gm;
        let vm: RegExpExecArray | null;
        while ((vm = valRe.exec(strText)) !== null) {
          const v = vm[2]!.trim();
          if (v.startsWith('{')) continue;
          if (!v.startsWith('"') && !v.startsWith('/')) {
            warnings.push({ line: b.startLine, message: `$${vm[1]}: value should be a "string" or /regex/` });
          }
        }
      }
    }

    const condText = textOf('condition');
    if (!condText.trim()) {
      errors.push({ line: b.startLine, message: `rule "${b.name}": empty condition` });
      continue;
    }
    const refRe = /[$#]([A-Za-z0-9_]+(?:\*)?)/g;
    let rm: RegExpExecArray | null;
    const referenced = new Set<string>();
    while ((rm = refRe.exec(condText)) !== null) referenced.add(rm[1]!);
    for (const ref of referenced) {
      if (ref.endsWith('*')) {
        const prefix = ref.slice(0, -1);
        if (![...definedIds].some((d) => d.startsWith(prefix))) {
          errors.push({ line: b.startLine, message: `wildcard $${ref} matches no defined string` });
        }
      } else if (!definedIds.has(ref)) {
        errors.push({ line: b.startLine, message: `$${ref} referenced in condition but not defined in strings:` });
      }
    }
    if (definedIds.size > 0) {
      for (const d of definedIds) {
        if (!referenced.has(d) && ![...referenced].some((r) => r.endsWith('*') && d.startsWith(r.slice(0, -1)))) {
          warnings.push({ line: b.startLine, message: `string $${d} defined but never used in condition` });
        }
      }
    }
  }

  return { valid: errors.length === 0, rules: bodies.length, errors, warnings };
}
// ── Sigma ────────────────────────────────────────────────────────────────

const SIGMA_STATUSES = new Set(['stable', 'test', 'experimental', 'deprecated', 'unsupported', 'experimental']);
const SIGMA_LEVELS = new Set(['informational', 'low', 'medium', 'high', 'critical']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGMA_COND_KEYWORDS = new Set([
  'and',
  'or',
  'not',
  'of',
  'them',
  'all',
  'any',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
]);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateSigmaRule(yamlSource: string): SigmaValidationResult {
  const errors: LineIssue[] = [];
  const warnings: LineIssue[] = [];
  if (!yamlSource || !yamlSource.trim()) {
    return { valid: false, errors: [{ message: 'empty Sigma YAML' }], warnings };
  }
  let doc: unknown;
  try {
    doc = load(yamlSource);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { valid: false, errors: [{ message: `YAML parse error: ${msg}` }], warnings };
  }
  if (!isRecord(doc)) {
    return { valid: false, errors: [{ message: 'Sigma rule must be a YAML mapping' }], warnings };
  }
  const title = doc['title'];
  if (typeof title !== 'string' || !title.trim()) errors.push({ message: 'missing required field: title' });
  const id = doc['id'];
  if (id === undefined) warnings.push({ message: 'missing id (recommended: UUID)' });
  else if (typeof id !== 'string' || !UUID_RE.test(id))
    warnings.push({ message: `id "${String(id).slice(0, 40)}" is not a UUID` });
  const status = doc['status'];
  if (status === undefined)
    warnings.push({ message: 'missing status (recommended: stable|test|experimental|deprecated)' });
  else if (typeof status !== 'string' || !SIGMA_STATUSES.has(status.toLowerCase()))
    warnings.push({ message: `unknown status "${String(status)}"` });
  const level = doc['level'];
  if (level === undefined)
    warnings.push({ message: 'missing level (recommended: informational|low|medium|high|critical)' });
  else if (typeof level !== 'string' || !SIGMA_LEVELS.has(level.toLowerCase()))
    warnings.push({ message: `unknown level "${String(level)}"` });
  if (doc['description'] === undefined) warnings.push({ message: 'missing description (recommended)' });
  const tags = doc['tags'];
  const tagList: string[] = Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
  if (Array.isArray(tags)) {
    for (const t of tagList) {
      if (t.startsWith('attack.')) {
        const suffix = t.slice(7);
        if (!/^t\d{4}(?:\.\d{3})?$/.test(suffix) && suffix !== suffix.toLowerCase()) {
          warnings.push({ message: `tag "${t}" should be lowercase attack.tXXXX` });
        } else if (suffix !== suffix.toLowerCase()) {
          warnings.push({ message: `tag "${t}" should be lowercase` });
        }
      }
    }
  }
  const ls = doc['logsource'];
  if (!isRecord(ls) || (!ls['category'] && !ls['product'] && !ls['service'] && !ls['definition'])) {
    errors.push({ message: 'missing or invalid logsource (need at least one of category/product/service)' });
  }
  const detection = doc['detection'];
  if (!isRecord(detection)) {
    errors.push({ message: 'missing detection: mapping' });
  } else {
    const condRaw = detection['condition'];
    if (condRaw === undefined) errors.push({ message: 'detection: missing condition' });
    else if (typeof condRaw !== 'string' && !Array.isArray(condRaw))
      errors.push({ message: 'detection.condition must be a string or array of strings' });
    const selections = Object.keys(detection).filter((k) => k !== 'condition' && k !== 'timeframe');
    if (selections.length === 0)
      errors.push({
        message: 'detection: no selections defined (need at least one named selection besides condition)',
      });
    else {
      for (const s of selections) {
        const v = (detection as Record<string, unknown>)[s];
        if (v === null || v === undefined) errors.push({ message: `detection.${s}: empty selection` });
        else if (isRecord(v) && Object.keys(v).length === 0) errors.push({ message: `detection.${s}: empty mapping` });
        else if (Array.isArray(v) && v.length === 0) errors.push({ message: `detection.${s}: empty list` });
      }
      // condition identifier check
      const conds: string[] =
        typeof condRaw === 'string'
          ? [condRaw]
          : Array.isArray(condRaw)
            ? condRaw.filter((x): x is string => typeof x === 'string')
            : [];
      for (const cond of conds) {
        const toks = sigmaConditionTokens(cond);
        for (const tok of toks) {
          if (SIGMA_COND_KEYWORDS.has(tok.toLowerCase())) continue;
          if (/^\d+$/.test(tok)) continue;
          // skip quoted strings
          if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'"))) continue;
          // wildcard prefix*
          if (tok.endsWith('*')) {
            const prefix = tok.slice(0, -1);
            if (!selections.some((s) => s.startsWith(prefix)))
              warnings.push({ message: `condition references "${tok}" which matches no selection` });
            continue;
          }
          if (tok === 'them' || tok === '*') continue;
          if (!selections.includes(tok)) warnings.push({ message: `condition references unknown selection "${tok}"` });
        }
      }
    }
  }
  const summary: SigmaSummary | undefined =
    typeof title === 'string' && title.trim()
      ? {
          title: title.trim(),
          id: typeof id === 'string' ? id : undefined,
          level: typeof level === 'string' ? level : undefined,
          status: typeof status === 'string' ? status : undefined,
          tags: tagList,
          logsource: isRecord(ls) ? ls : {},
        }
      : undefined;
  return { valid: errors.length === 0, errors, warnings, rule: summary };
}

function sigmaConditionTokens(cond: string): string[] {
  // strip parens into spaced tokens, keep quoted strings intact
  const out: string[] = [];
  let i = 0;
  const n = cond.length;
  while (i < n) {
    const ch = cond[i]!;
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < n && cond[j] !== quote) {
        if (cond[j] === '\\') j++;
        j++;
      }
      out.push(cond.slice(i, j < n ? j + 1 : n));
      i = j < n ? j + 1 : n;
      continue;
    }
    if (ch === '(' || ch === ')') {
      out.push(ch);
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && !/\s/.test(cond[j]!) && cond[j] !== '(' && cond[j] !== ')') j++;
    out.push(cond.slice(i, j));
    i = j;
  }
  return out.filter((t) => t !== '' && t !== '(' && t !== ')');
}

// ── Sigma → SPL / KQL conversion ──────────────────────────────────────────

function escapeSplunkValue(v: string): string {
  return v.replace(/"/g, '\\"');
}
function escapeKqlValue(v: string): string {
  return v.replace(/"/g, '\\"');
}

type FieldOp =
  'plain' | 'contains' | 'startswith' | 'endswith' | 're' | 'null' | 'gt' | 'gte' | 'lt' | 'lte' | 'unknown';

function parseFieldSpec(spec: string): { field: string; op: FieldOp; modifier?: string } {
  const parts = spec.split('|');
  const field = parts[0]!.trim();
  const mod = parts.slice(1).join('|').trim().toLowerCase();
  if (!mod) return { field, op: 'plain' };
  if (mod === 'contains' || mod === 'contains|all') return { field, op: 'contains', modifier: mod };
  if (mod === 'startswith') return { field, op: 'startswith', modifier: mod };
  if (mod === 'endswith') return { field, op: 'endswith', modifier: mod };
  if (mod === 're' || mod === 're|contains' || mod === 'contains|windash' || mod === 'windash')
    return { field, op: 're', modifier: mod };
  if (mod === 'gte' || mod === 'ge') return { field, op: 'gte', modifier: mod };
  if (mod === 'gt') return { field, op: 'gt', modifier: mod };
  if (mod === 'lte' || mod === 'le') return { field, op: 'lte', modifier: mod };
  if (mod === 'lt') return { field, op: 'lt', modifier: mod };
  if (mod.startsWith('base64')) return { field, op: 'contains', modifier: mod };
  if (mod === 'all') return { field, op: 'plain', modifier: mod };
  return { field, op: 'unknown', modifier: mod };
}

function fieldExprSplunk(
  field: string,
  op: FieldOp,
  raw: unknown,
  mappedField: string,
  warnings: string[]
): string | null {
  if (raw === null) return `NOT ${mappedField}=*`;
  const v = String(raw);
  const esc = escapeSplunkValue(v);
  if (op === 'plain') return `${mappedField}="${esc}"`;
  if (op === 'contains') return `${mappedField}="*${esc}*"`;
  if (op === 'startswith') return `${mappedField}="${esc}*"`;
  if (op === 'endswith') return `${mappedField}="*${esc}"`;
  if (op === 're') {
    warnings.push(`field ${field}: |re treated as plain quoted match in SPL (native regex not emitted)`);
    return `${mappedField}="${esc}"`;
  }
  if (op === 'gt') return `${mappedField}>${esc}`;
  if (op === 'gte') return `${mappedField}>=${esc}`;
  if (op === 'lt') return `${mappedField}<${esc}`;
  if (op === 'lte') return `${mappedField}<=${esc}`;
  warnings.push(`field ${field}: unknown modifier "${String((raw as string) || '')}" treated as plain`);
  return `${mappedField}="${esc}"`;
}

function fieldExprKql(
  field: string,
  op: FieldOp,
  raw: unknown,
  mappedField: string,
  warnings: string[]
): string | null {
  if (raw === null) return `isnotempty(${mappedField}) == false`;
  const v = String(raw);
  const esc = escapeKqlValue(v);
  if (op === 'plain') return `${mappedField} == "${esc}"`;
  if (op === 'contains') return `${mappedField} contains "${esc}"`;
  if (op === 'startswith') return `${mappedField} startswith "${esc}"`;
  if (op === 'endswith') return `${mappedField} endswith "${esc}"`;
  if (op === 're') return `${mappedField} matches regex "${esc}"`;
  if (op === 'gt') return `${mappedField} > "${esc}"`;
  if (op === 'gte') return `${mappedField} >= "${esc}"`;
  if (op === 'lt') return `${mappedField} < "${esc}"`;
  if (op === 'lte') return `${mappedField} <= "${esc}"`;
  warnings.push(`field ${field}: unknown modifier treated as plain in KQL`);
  return `${mappedField} == "${esc}"`;
}

function selectionToExpr(
  selName: string,
  selValue: unknown,
  target: 'splunk' | 'kql',
  fieldMap: Record<string, string> | undefined,
  warnings: string[]
): string {
  const fieldExpr = target === 'splunk' ? fieldExprSplunk : fieldExprKql;
  // Array of maps (OR of AND-groups) or array of scalars
  if (Array.isArray(selValue)) {
    if (selValue.length === 0) return '';
    // detect array-of-maps vs keyword list
    const allMaps = selValue.every((e) => typeof e === 'object' && e !== null && !Array.isArray(e));
    if (allMaps) {
      const groups = (selValue as Record<string, unknown>[])
        .map((m) => {
          const parts = Object.entries(m)
            .map(([k, v]) => {
              const { field, op } = parseFieldSpec(k);
              const mapped = fieldMap?.[field] ?? field;
              const vals: unknown[] = Array.isArray(v) ? (v as unknown[]) : [v];
              const exprs = vals
                .map((one) => fieldExpr(field, op, one, mapped, warnings))
                .filter((x): x is string => !!x);
              return exprs.length === 1 ? exprs[0]! : `(${exprs.join(' OR ')})`;
            })
            .filter(Boolean);
          return parts.length === 1 ? parts[0]! : `(${parts.join(' AND ')})`;
        })
        .filter(Boolean);
      if (groups.length === 0) return '';
      if (groups.length === 1) return groups[0]!;
      return `(${groups.join(' OR ')})`;
    }
    // array of scalars (keyword selection) or mixed
    const scalarVals = selValue.filter((e) => typeof e === 'string' || typeof e === 'number');
    if (scalarVals.length > 0 && selValue.every((e) => typeof e === 'string' || typeof e === 'number')) {
      const parts = (scalarVals as (string | number)[]).map((v) => {
        const esc = target === 'splunk' ? escapeSplunkValue(String(v)) : escapeKqlValue(String(v));
        return target === 'splunk' ? `"${esc}"` : `* contains "${esc}"`;
      });
      return parts.length === 1 ? parts[0]! : `(${parts.join(' OR ')})`;
    }
    // fallback
    return `(${selValue.map((e) => JSON.stringify(e)).join(' OR ')})`;
  }
  if (typeof selValue === 'object' && selValue !== null) {
    const parts = Object.entries(selValue as Record<string, unknown>)
      .map(([k, v]) => {
        const { field, op, modifier } = parseFieldSpec(k);
        if (modifier?.startsWith('base64')) warnings.push(`field ${field}: |base64* approximated as contains`);
        if (op === 'unknown') warnings.push(`field ${field}: unknown modifier "${modifier}"`);
        const mapped = fieldMap?.[field] ?? field;
        const vals: unknown[] = Array.isArray(v) ? (v as unknown[]) : [v];
        const exprs = vals
          .map((one) => fieldExpr(field, op === 'unknown' ? 'plain' : op, one, mapped, warnings))
          .filter((x): x is string => !!x);
        return exprs.length === 1 ? exprs[0]! : `(${exprs.join(' OR ')})`;
      })
      .filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0]!;
    return `(${parts.join(' AND ')})`;
  }
  // scalar keyword
  const esc = target === 'splunk' ? escapeSplunkValue(String(selValue)) : escapeKqlValue(String(selValue));
  return target === 'splunk' ? `"${esc}"` : `* contains "${esc}"`;
}

function expandSigmaCondition(cond: string, selectionExprs: Record<string, string>, warnings: string[]): string {
  const selNames = Object.keys(selectionExprs);
  // tokenize preserving parens and quoted strings — reuse helper
  const toks = sigmaConditionTokens(cond);
  // shunting-yard style: build expression AST for AND/OR/NOT plus N-of expansions
  // Expand N-of/all-of/any-of before parsing
  const expanded: string[] = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i]!;
    const low = t.toLowerCase();
    // detect "N of X" / "all of X" / "any of X" / "1 of them"
    const isCount = /^\d+$/.test(t) || low === 'all' || low === 'any' || low === '1';
    if (isCount && i + 2 < toks.length && toks[i + 1]!.toLowerCase() === 'of') {
      const target = toks[i + 2]!;
      const countRaw = t;
      let matched: string[] = [];
      if (target === 'them' || target === '*') matched = [...selNames];
      else if (target.endsWith('*')) matched = selNames.filter((s) => s.startsWith(target.slice(0, -1)));
      else if (selNames.includes(target)) matched = [target];
      else warnings.push(`condition: "${countRaw} of ${target}" matches no selection`);
      if (matched.length > 0) {
        const exprs = matched.map((n) => selectionExprs[n]!).filter(Boolean);
        if (low === 'all') expanded.push(exprs.length === 1 ? exprs[0]! : `(${exprs.join(' AND ')})`);
        else expanded.push(exprs.length === 1 ? exprs[0]! : `(${exprs.join(' OR ')})`);
      } else {
        expanded.push('(false)');
      }
      i += 3;
      continue;
    }
    if (low === 'and' || low === 'or' || low === 'not' || t === '(' || t === ')') {
      expanded.push(low === 'and' ? 'AND' : low === 'or' ? 'OR' : low === 'not' ? 'NOT' : t);
      i++;
      continue;
    }
    // identifier → its expression
    if (selectionExprs[t] !== undefined) {
      expanded.push(selectionExprs[t]!);
    } else if (t.endsWith('*')) {
      const prefix = t.slice(0, -1);
      const matched = selNames.filter((s) => s.startsWith(prefix));
      if (matched.length === 0) warnings.push(`condition references "${t}" which matches no selection`);
      const exprs = matched.map((n) => selectionExprs[n]!).filter(Boolean);
      expanded.push(exprs.length <= 1 ? (exprs[0] ?? t) : `(${exprs.join(' OR ')})`);
    } else {
      warnings.push(`condition token "${t}" is not a known selection`);
      expanded.push(t);
    }
    i++;
  }
  return expanded.join(' ').replace(/\s+/g, ' ').trim();
}

function buildSigmaQuery(
  yamlSource: string,
  target: 'splunk' | 'kql',
  fieldMap?: Record<string, string>
): ConversionResult {
  const warnings: string[] = [];
  let doc: unknown;
  try {
    doc = load(yamlSource);
  } catch (e) {
    return {
      ok: false,
      query: '',
      target,
      warnings,
      error: `YAML parse error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!isRecord(doc)) return { ok: false, query: '', target, warnings, error: 'not a mapping' };
  const detection = doc['detection'] as Record<string, unknown> | undefined;
  if (!isRecord(detection)) return { ok: false, query: '', target, warnings, error: 'missing detection' };
  const condRaw = detection['condition'];
  const selectionKeys = Object.keys(detection).filter((k) => k !== 'condition' && k !== 'timeframe');
  const selExprs: Record<string, string> = {};
  for (const k of selectionKeys) {
    selExprs[k] = selectionToExpr(k, (detection as Record<string, unknown>)[k], target, fieldMap, warnings);
  }
  const conds: string[] =
    typeof condRaw === 'string'
      ? [condRaw]
      : Array.isArray(condRaw)
        ? (condRaw as unknown[]).filter((x): x is string => typeof x === 'string')
        : [];
  let body = '';
  if (conds.length === 0) {
    // no condition → OR all selections
    const all = Object.values(selExprs).filter(Boolean);
    body = all.length === 1 ? all[0]! : `(${all.join(' OR ')})`;
    warnings.push('no condition: defaulted to OR of all selections');
  } else if (conds.length === 1) {
    body = expandSigmaCondition(conds[0]!, selExprs, warnings);
  } else {
    body = `(${conds.map((c) => expandSigmaCondition(c, selExprs, warnings)).join(' OR ')})`;
  }
  // header comments
  const headers: string[] = [];
  if (typeof doc['title'] === 'string')
    headers.push(target === 'splunk' ? `# title: ${doc['title']}` : `// title: ${doc['title']}`);
  const ls = doc['logsource'];
  if (isRecord(ls)) {
    const lsParts = Object.entries(ls)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(' ');
    if (lsParts) headers.push(target === 'splunk' ? `# logsource: ${lsParts}` : `// logsource: ${lsParts}`);
  }
  const query = headers.length ? `${headers.join('\n')}\n${body}` : body;
  return { ok: true, query, target, warnings };
}

export function convertSigmaToSplunk(yamlSource: string, fieldMap?: Record<string, string>): ConversionResult {
  return buildSigmaQuery(yamlSource, 'splunk', fieldMap);
}
export function convertSigmaToKql(yamlSource: string, fieldMap?: Record<string, string>): ConversionResult {
  return buildSigmaQuery(yamlSource, 'kql', fieldMap);
}

// ── osquery ────────────────────────────────────────────────────────────────

const FORBIDDEN_OSQUERY = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|REINDEX|VACUUM|PRAGMA)\b/i;
const KNOWN_OSQUERY_TABLES = new Set([
  'processes',
  'process_events',
  'process_open_sockets',
  'process_memory_map',
  'process_envs',
  'users',
  'logged_in_users',
  'user_events',
  'user_ssh_keys',
  'groups',
  'file',
  'file_events',
  'file_changes',
  'hash',
  'yara',
  'yara_events',
  'socket_events',
  'listening_ports',
  'interface_addresses',
  'interface_details',
  'routes',
  'arp_cache',
  'dns_resolvers',
  'etc_hosts',
  'registry',
  'registry_events',
  'patches',
  'programs',
  'services',
  'scheduled_tasks',
  'startup_items',
  'drivers',
  'device_drivers',
  'chrome_extensions',
  'firefox_addons',
  'browser_plugins',
  'safari_extensions',
  'certificates',
  'carves',
  'curl',
  'curl_certificate',
  'os_version',
  'osquery_info',
  'osquery_flags',
  'osquery_schedule',
  'time',
  'uptime',
  'system_info',
  'ec2_instance_metadata',
  'azure_instance_metadata',
  'ntfs_acl_permissions',
  'windows_crashes',
  'windows_events',
  'windows_update_history',
  'autoexec',
  'ie_extensions',
  'shared_resources',
  'shares',
  'logical_drives',
  'physical_disk_performance',
  'mounts',
  'block_devices',
  'disk_encryption',
  'ca_certs',
  'last',
  'logged_in_users',
  'sudoers',
  'authorized_keys',
  'package_bom',
  'homebrew_packages',
  'alf',
  'alf_exceptions',
  'crashes',
  'launchd',
  'launchd_overrides',
  'managed_policies',
  'gatekeeper',
  'gatekeeper_approved_apps',
  'sip_config',
  'nvram',
  'kernel_modules',
  'kernel_info',
  'kernel_extensions',
  'memory_map',
  'memory_info',
  'memory_array_mapped_addresses',
  'open_files',
  'mdfind',
  'spotlight',
  'time_machine_backups',
  'wifi_networks',
  'wifi_scan',
  'wifi_status',
  'battery',
  'temperature_sensors',
  'usb_devices',
  'connected_displays',
  'apps',
  'app_schemes',
  'alf_exceptions',
  'apparmor_profiles',
]);
const HIGH_VOLUME_TABLES = new Set([
  'process_events',
  'socket_events',
  'file_events',
  'yara_events',
  'registry_events',
  'user_events',
  'windows_events',
]);

export function validateOsquerySql(sql: string): OsqueryValidationResult {
  const errors: LineIssue[] = [];
  const warnings: LineIssue[] = [];
  const tables: string[] = [];
  if (!sql || !sql.trim()) return { valid: false, errors: [{ message: 'empty osquery SQL' }], warnings, tables };
  const trimmed = sql.trim();
  const m = FORBIDDEN_OSQUERY.exec(trimmed);
  if (m) errors.push({ message: `osquery is read-only: forbidden keyword ${m[1]}` });
  // multi-statement (semicolon with non-whitespace after)
  const semi = trimmed.indexOf(';');
  if (semi >= 0 && trimmed.slice(semi + 1).trim().length > 0)
    errors.push({ message: 'multiple statements detected (semicolon with trailing content)' });
  // balanced parens outside strings
  let depth = 0;
  let inSq = false;
  let inDq = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (ch === "'" && !inDq) {
      if (i > 0 && trimmed[i - 1] === '\\') continue;
      inSq = !inSq;
      continue;
    }
    if (ch === '"' && !inSq) {
      if (i > 0 && trimmed[i - 1] === '\\') continue;
      inDq = !inDq;
      continue;
    }
    if (inSq || inDq) continue;
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth < 0) {
        errors.push({ message: 'unbalanced closing parenthesis' });
        depth = 0;
      }
    }
  }
  if (depth > 0) errors.push({ message: `${depth} unclosed parenthesis(s)` });
  if (!/\bFROM\b/i.test(trimmed) && !/\bJOIN\b/i.test(trimmed)) warnings.push({ message: 'no FROM/JOIN clause found' });
  const fromRe = /\b(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
  let fm: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((fm = fromRe.exec(trimmed)) !== null) {
    const tbl = fm[1]!.toLowerCase();
    if (!seen.has(tbl)) {
      seen.add(tbl);
      tables.push(tbl);
    }
    if (!KNOWN_OSQUERY_TABLES.has(tbl)) warnings.push({ message: `unknown osquery table "${tbl}"` });
    if (HIGH_VOLUME_TABLES.has(tbl) && !/\bWHERE\b/i.test(trimmed))
      warnings.push({ message: `table "${tbl}" is high-volume; add a WHERE clause to bound the scan` });
  }
  const firstWord = trimmed.replace(/^\(+/, '').trim().split(/\s+/)[0]!.toUpperCase();
  if (firstWord !== 'SELECT' && firstWord !== 'WITH')
    errors.push({ message: `osquery SQL must start with SELECT or WITH (got ${firstWord})` });
  return { valid: errors.length === 0, errors, warnings, tables };
}

// ── Suricata / Snort ───────────────────────────────────────────────────────

const VALID_ACTIONS = new Set(['alert', 'drop', 'pass', 'reject', 'rejectsrc', 'rejectdst', 'rejectboth']);
const VALID_PROTOCOLS = new Set([
  'tcp',
  'udp',
  'icmp',
  'ip',
  'http',
  'tls',
  'dns',
  'ssh',
  'ftp',
  'smtp',
  'smb',
  'dcerpc',
  'dhcp',
  'krb5',
  'nfs',
  'tftp',
  'any',
]);
const KNOWN_MODIFIERS = new Set([
  'http_uri',
  'http_raw_uri',
  'http_header',
  'http_raw_header',
  'http_cookie',
  'http_user_agent',
  'http_host',
  'http_raw_host',
  'http_method',
  'http_stat_code',
  'http_stat_msg',
  'http_client_body',
  'http_server_body',
  'dns_query',
  'dns.query',
  'tls.sni',
  'tls.cert_subject',
  'tls.cert_issuer',
  'tls.certs',
  'tls.version',
  'ssh.protoversion',
  'ssh.softwareversion',
  'file_data',
  'file.name',
  'file.magic',
  'urilen',
  'dsize',
  'isdataat',
  'byte_test',
  'byte_jump',
  'byte_extract',
  'pcre',
  'content',
  'nocase',
  'rawbytes',
]);

export function validateSuricataRule(ruleText: string): SuricataValidationResult {
  const errors: LineIssue[] = [];
  const warnings: LineIssue[] = [];
  if (!ruleText || !ruleText.trim()) return { valid: false, errors: [{ message: 'empty rule' }], warnings };
  const lines = ruleText.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  const first = lines[0] ?? ruleText;
  // Split header vs options at first '(' that is followed later by ')' at end.
  const optsStart = first.indexOf('(');
  const optsEnd = first.lastIndexOf(')');
  let header = first;
  let opts = '';
  if (optsStart >= 0 && optsEnd > optsStart) {
    header = first.slice(0, optsStart).trim();
    opts = first.slice(optsStart + 1, optsEnd);
  } else if (optsStart >= 0) {
    errors.push({ message: 'options section: opening ( without closing )' });
  }
  const headerParts = header.trim().split(/\s+/).filter(Boolean);
  if (headerParts.length < 7) {
    errors.push({
      message: `header requires 7 fields (action proto src sport dir dst dport), got ${headerParts.length}: "${header}"`,
    });
    return { valid: false, errors, warnings };
  }
  const [actionRaw, protoRaw, _src, sport, dir, _dst, dport] = headerParts as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const action = actionRaw.toLowerCase();
  const proto = protoRaw.toLowerCase();
  if (!VALID_ACTIONS.has(action))
    errors.push({ message: `unknown action "${actionRaw}" (expected alert|drop|pass|reject)` });
  if (!VALID_PROTOCOLS.has(proto)) warnings.push({ message: `uncommon protocol "${protoRaw}"` });
  if (dir !== '->' && dir !== '<>' && dir !== '<-')
    errors.push({ message: `direction must be -> or <> (got "${dir}")` });
  const portRe = /^(!)?(\[.*\]|any|\d+(:\d+)?|\$[A-Za-z_][A-Za-z0-9_]*)$/;
  if (!portRe.test(sport)) warnings.push({ message: `suspicious src port "${sport}"` });
  if (!portRe.test(dport)) warnings.push({ message: `suspicious dst port "${dport}"` });
  if (opts) {
    const quoteCount = (opts.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) errors.push({ message: 'options: unbalanced double quotes' });
    const sidM = opts.match(/\bsid\s*:\s*(\d+)\s*;/i);
    const revM = opts.match(/\brev\s*:\s*(\d+)\s*;/i);
    const msgM = opts.match(/\bmsg\s*:\s*"([^"]*)"/i);
    if (!msgM) warnings.push({ message: 'options: missing msg:"..."' });
    if (!sidM) warnings.push({ message: 'options: missing sid' });
    else {
      const sid = parseInt(sidM[1]!, 10);
      if (sid < 1000000)
        warnings.push({ message: `sid ${sid} is below 1000000 (reserved range; use >=1000000 for local rules)` });
    }
    if (!revM) warnings.push({ message: 'options: missing rev' });
    // content modifier warnings
    const optTokens = opts
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const tok of optTokens) {
      const lower = tok.toLowerCase().trim();
      if (
        !lower ||
        lower.startsWith('msg') ||
        lower.startsWith('sid') ||
        lower.startsWith('rev') ||
        lower.startsWith('classtype') ||
        lower.startsWith('reference') ||
        lower.startsWith('metadata')
      )
        continue;
      // bare modifier tokens like http_uri, dns_query without value
      const bare = lower.split(/\s+/)[0]!;
      if (KNOWN_MODIFIERS.has(bare)) continue;
      // content: modifier is content itself
      if (lower.startsWith('content')) continue;
      if (
        lower.startsWith('pcre') ||
        lower.startsWith('byte_') ||
        lower.startsWith('flow') ||
        lower.startsWith('flags') ||
        lower.startsWith('threshold') ||
        lower.startsWith('detection_filter') ||
        lower.startsWith('distance') ||
        lower.startsWith('within') ||
        lower.startsWith('depth') ||
        lower.startsWith('offset') ||
        lower.startsWith('isdataat') ||
        lower.startsWith('dsize') ||
        lower.startsWith('urilen')
      )
        continue;
      // unknown bare word used as modifier — flag only if it looks modifier-ish (contains . or _ and no colon)
      // keep noise low: skip common option prefixes already handled
    }
  } else {
    warnings.push({ message: 'no options section found (expected (...) with msg/sid/rev)' });
  }
  const parsed: SuricataParsed | undefined =
    headerParts.length >= 7
      ? {
          action: actionRaw,
          protocol: protoRaw,
          sid: (() => {
            const mm = opts.match(/\bsid\s*:\s*(\d+)/i);
            return mm ? parseInt(mm[1]!, 10) : undefined;
          })(),
          rev: (() => {
            const mm = opts.match(/\brev\s*:\s*(\d+)/i);
            return mm ? parseInt(mm[1]!, 10) : undefined;
          })(),
          msg: (() => {
            const mm = opts.match(/\bmsg\s*:\s*"([^"]*)"/i);
            return mm ? mm[1] : undefined;
          })(),
        }
      : undefined;
  return { valid: errors.length === 0, errors, warnings, parsed };
}

// ── Dispatcher ─────────────────────────────────────────────────────────────

export function validateRule(
  kind: RuleKind,
  source: string
): YaraValidationResult | SigmaValidationResult | SuricataValidationResult | OsqueryValidationResult {
  switch (kind) {
    case 'yara':
      return validateYaraRule(source);
    case 'sigma':
      return validateSigmaRule(source);
    case 'suricata':
    case 'snort':
      return validateSuricataRule(source);
    case 'osquery':
      return validateOsquerySql(source);
    default:
      return {
        valid: false,
        errors: [{ message: `unknown rule kind "${kind}"` }],
        warnings: [],
      } as SigmaValidationResult;
  }
}
