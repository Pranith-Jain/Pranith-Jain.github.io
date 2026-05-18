import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Copy, Check } from 'lucide-react';

/**
 * Sigma Rule Converter — 100% client-side.
 *
 * Converts a Sigma rule (YAML) to Splunk SPL, Microsoft KQL, and Elastic
 * Lucene. The repo has no YAML dependency, so a focused parser handles
 * the Sigma detection subset: key:value / key:[list] / list-of-maps
 * selections, field modifiers (contains/startswith/endswith/all/re),
 * keyword lists, and condition expressions (and/or/not/parens,
 * "1 of"/"all of" them/prefix*). Field mapping is intentionally
 * pass-through — point the field names at your schema after conversion.
 */

interface SigmaParsed {
  title?: string;
  detection: Record<string, unknown>;
  condition: string;
  unsupported: string[];
}

/* ---------- minimal indentation YAML (Sigma subset) ---------- */

function parseScalar(v: string): string | number | boolean {
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t !== '' && !Number.isNaN(Number(t)) && /^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

interface Line {
  indent: number;
  text: string;
}

function lex(src: string): Line[] {
  return src
    .split('\n')
    .map((l) => l.replace(/\t/g, '  '))
    .filter((l) => l.trim() !== '' && !/^\s*#/.test(l))
    .map((l) => ({ indent: l.length - l.trimStart().length, text: l.trim() }));
}

// Recursive-descent over indentation. Returns the parsed node and the
// number of lines consumed.
function parseBlock(lines: Line[], start: number, indent: number): { node: unknown; next: number } {
  // List?
  if (lines[start] && lines[start]!.text.startsWith('- ') && lines[start]!.indent >= indent) {
    const arr: unknown[] = [];
    let i = start;
    const lvl = lines[start]!.indent;
    while (i < lines.length && lines[i]!.indent === lvl && lines[i]!.text.startsWith('- ')) {
      const rest = lines[i]!.text.slice(2).trim();
      if (rest.includes(':') && !/^["']/.test(rest)) {
        // list of maps — re-inject the "key: val" as a child line set
        const synth: Line[] = [{ indent: lvl + 2, text: rest }];
        let j = i + 1;
        while (j < lines.length && lines[j]!.indent > lvl) {
          synth.push(lines[j]!);
          j++;
        }
        const { node } = parseBlock(synth, 0, lvl + 2);
        arr.push(node);
        i = j;
      } else {
        arr.push(parseScalar(rest));
        i++;
      }
    }
    return { node: arr, next: i };
  }

  // Map
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
      // nested block
      if (i + 1 < lines.length && lines[i + 1]!.indent > lvl) {
        const { node, next } = parseBlock(lines, i + 1, lines[i + 1]!.indent);
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
        .map((s) => parseScalar(s))
        .filter((s) => s !== '');
      i++;
    } else {
      obj[key] = parseScalar(val);
      i++;
    }
  }
  return { node: obj, next: i };
}

function parseSigma(src: string): SigmaParsed | { error: string } {
  const lines = lex(src);
  if (lines.length === 0) return { error: 'empty input' };
  const { node } = parseBlock(lines, 0, lines[0]!.indent);
  const doc = node as Record<string, unknown>;
  const detection = (doc.detection as Record<string, unknown>) ?? null;
  if (!detection || typeof detection !== 'object')
    return { error: 'no `detection:` block found (is this a Sigma rule?)' };
  const condition = String(detection.condition ?? '');
  if (!condition) return { error: 'no `condition:` inside detection' };
  return { title: doc.title ? String(doc.title) : undefined, detection, condition, unsupported: [] };
}

/* ---------- selection → backend expression ---------- */

type Backend = 'splunk' | 'kql' | 'lucene';

function esc(v: string, b: Backend): string {
  if (b === 'lucene') return v.replace(/(["\\])/g, '\\$1');
  return v.replace(/"/g, '\\"');
}

function fieldExpr(field: string, valuesIn: unknown, b: Backend): string {
  const [name, ...mods] = field.split('|');
  const f = name!;
  const values = Array.isArray(valuesIn) ? valuesIn.map(String) : [String(valuesIn)];
  const mod = mods.join('|');
  const wrap = (parts: string[], op: 'OR' | 'AND') => (parts.length === 1 ? parts[0]! : `(${parts.join(` ${op} `)})`);

  const one = (val: string): string => {
    const v = esc(val, b);
    if (mod.includes('contains'))
      return b === 'splunk' ? `${f}="*${v}*"` : b === 'kql' ? `${f} contains "${v}"` : `${f}:*${v}*`;
    if (mod.includes('startswith'))
      return b === 'splunk' ? `${f}="${v}*"` : b === 'kql' ? `${f} startswith "${v}"` : `${f}:${v}*`;
    if (mod.includes('endswith'))
      return b === 'splunk' ? `${f}="*${v}"` : b === 'kql' ? `${f} endswith "${v}"` : `${f}:*${v}`;
    if (mod.includes('re'))
      return b === 'splunk'
        ? `${f}=*` + ` | regex ${f}="${v}"`
        : b === 'kql'
          ? `${f} matches regex "${v}"`
          : `${f}:/${val}/`;
    return b === 'splunk' ? `${f}="${v}"` : b === 'kql' ? `${f} == "${v}"` : `${f}:"${v}"`;
  };

  const exprs = values.map(one);
  // `|all` → every value must match (AND); default list semantics is OR.
  return wrap(exprs, mod.includes('all') ? 'AND' : 'OR');
}

function selectionExpr(sel: unknown, b: Backend): string {
  // keyword list → free-text match on any
  if (Array.isArray(sel)) {
    const parts = sel.map((kw) =>
      b === 'splunk'
        ? `"${esc(String(kw), b)}"`
        : b === 'kql'
          ? `* contains "${esc(String(kw), b)}"`
          : `"${esc(String(kw), b)}"`
    );
    return parts.length === 1 ? parts[0]! : `(${parts.join(' OR ')})`;
  }
  if (sel && typeof sel === 'object') {
    const m = sel as Record<string, unknown>;
    const parts = Object.entries(m).map(([k, v]) => fieldExpr(k, v, b));
    return parts.length === 1 ? parts[0]! : `(${parts.join(' AND ')})`;
  }
  return `"${esc(String(sel), b)}"`;
}

/* ---------- condition → expression tree ---------- */

function buildCondition(detection: Record<string, unknown>, condition: string, b: Backend): string {
  const names = Object.keys(detection).filter((k) => k !== 'condition' && k !== 'timeframe');
  const exprOf = (n: string) => (n in detection ? selectionExpr(detection[n], b) : `/* unknown selection ${n} */`);

  const AND = b === 'kql' ? 'and' : 'AND';
  const OR = b === 'kql' ? 'or' : 'OR';
  const NOT = b === 'kql' ? 'not ' : 'NOT ';

  // Expand quantifiers: "1 of selection*", "all of them", etc.
  const cond = condition
    .replace(/\ball of them\b/gi, `( ${names.join(' AND ')} )`)
    .replace(/\b1 of them\b/gi, `( ${names.join(' OR ')} )`)
    .replace(/\ball of ([\w*]+)\b/gi, (_m, p: string) => {
      const pre = p.replace('*', '');
      const grp = names.filter((n) => n.startsWith(pre));
      return `( ${(grp.length ? grp : [p]).join(' AND ')} )`;
    })
    .replace(/\b1 of ([\w*]+)\b/gi, (_m, p: string) => {
      const pre = p.replace('*', '');
      const grp = names.filter((n) => n.startsWith(pre));
      return `( ${(grp.length ? grp : [p]).join(' OR ')} )`;
    });

  // Tokenise and substitute selection names with their expressions.
  const tokens = cond.match(/\(|\)|\b(?:and|or|not)\b|[\w-]+/gi) ?? [];
  const out = tokens
    .map((t) => {
      const lt = t.toLowerCase();
      if (t === '(' || t === ')') return t;
      if (lt === 'and') return AND;
      if (lt === 'or') return OR;
      if (lt === 'not') return NOT.trim();
      return exprOf(t);
    })
    .join(' ')
    .replace(/\bNOT\s+/g, NOT)
    .replace(/\bnot\s+/g, NOT);

  return out.replace(/\s+/g, ' ').trim();
}

function convert(parsed: SigmaParsed): { splunk: string; kql: string; lucene: string } {
  const expr = (b: Backend) => buildCondition(parsed.detection, parsed.condition, b);
  return {
    splunk: expr('splunk'),
    kql: `union * | where ${expr('kql')}`,
    lucene: expr('lucene'),
  };
}

const SAMPLE = `title: Suspicious PowerShell Download Cradle
logsource:
  product: windows
  category: process_creation
detection:
  selection:
    Image|endswith: '\\\\powershell.exe'
  cradle:
    CommandLine|contains:
      - 'DownloadString'
      - 'IEX'
      - 'FromBase64String'
  condition: selection and cradle
level: high`;

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? 'copied' : 'copy'}
    </button>
  );
}

export default function SigmaConverter(): JSX.Element {
  const [input, setInput] = useState('');
  type Result =
    | { kind: 'error'; error: string }
    | { kind: 'ok'; parsed: SigmaParsed; out: { splunk: string; kql: string; lucene: string } };
  const result = useMemo<Result | null>(() => {
    if (!input.trim()) return null;
    const p = parseSigma(input);
    if ('error' in p) return { kind: 'error', error: p.error };
    try {
      return { kind: 'ok', parsed: p, out: convert(p) };
    } catch (e) {
      return { kind: 'error', error: `conversion failed: ${(e as Error).message}` };
    }
  }, [input]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2">Sigma Rule Converter</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-3 max-w-2xl">
          Paste a Sigma rule (YAML). It is converted to Splunk SPL, Microsoft KQL, and Elastic Lucene locally — nothing
          leaves your browser.
        </p>
        <p className="text-[12px] text-amber-700 dark:text-amber-400 mb-5 max-w-2xl flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          Field names are pass-through (no taxonomy mapping) — repoint them at your data model after conversion.
          Supports the common detection subset: list/map selections, contains/startswith/endswith/all/re modifiers, and
          and/or/not + "1 of"/"all of" conditions.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setInput(SAMPLE)}
            className="text-[12px] font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
          >
            load example
          </button>
          {input && (
            <button
              type="button"
              onClick={() => setInput('')}
              className="text-[12px] font-mono px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400"
            >
              clear
            </button>
          )}
        </div>
      </div>

      <label htmlFor="sigma-input" className="sr-only">
        Sigma rule YAML
      </label>
      <textarea
        id="sigma-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="title: …&#10;detection:&#10;  selection:&#10;    EventID: 4688&#10;  condition: selection"
        rows={12}
        spellCheck={false}
        aria-label="Sigma rule YAML"
        className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-[13px] text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
      />

      {result?.kind === 'error' && (
        <p className="mt-6 text-sm font-mono text-rose-600 dark:text-rose-400">parse error: {result.error}</p>
      )}

      {result?.kind === 'ok' && (
        <div className="mt-8 space-y-4">
          {result.parsed.title && <p className="text-sm text-slate-500 font-mono">// {result.parsed.title}</p>}
          {(
            [
              ['Splunk SPL', result.out.splunk],
              ['Microsoft KQL', result.out.kql],
              ['Elastic Lucene', result.out.lucene],
            ] as const
          ).map(([label, code]) => (
            <section
              key={label}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display font-semibold text-sm">{label}</h3>
                <CopyBtn text={code} />
              </div>
              <pre className="font-mono text-[13px] text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-all">
                {code}
              </pre>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
