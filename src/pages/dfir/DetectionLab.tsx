import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ToolDocs } from '../../components/dfir/ToolDocs';
import {
  ArrowLeft,
  FlaskConical,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Save,
  Trash2,
  FileDown,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import {
  evaluateRules,
  type DetectionRule,
  type EngineIndicator,
  type Detection,
} from '../../lib/dfir/detection-engine';
import { groupedStarters } from '../../lib/dfir/detection-starters';

const STORAGE_KEY = 'dfir-detection-rules:v1';

interface SavedRule {
  id: string;
  name: string;
  json: string;
  created: string;
  modified: string;
}

/**
 * Starter rule. Fires on any IOC tagged "Cobalt Strike" / "c2" in its
 * source context. Cobalt Strike is the dominant C2 framework in active
 * tracker hits (~96% per the /threatintel/c2-tracker), so this is a
 * realistic first-rule for a new analyst to author and watch fire.
 *
 * Tweak the regex or kind, save, then check the live feed strip to
 * see whether your rule matches anything against the rolling IOC
 * window.
 */
const TEMPLATE = `{
  "id": "cobalt-strike-c2-ip",
  "name": "Cobalt Strike / generic C2 IP",
  "severity": "high",
  "description": "Fires when an IP indicator carries a Cobalt Strike or generic C2 tag in its source context. Commodity post-exploitation framework — internet-reachable infra is post-compromise traffic, not opportunistic scanning.",
  "match": {
    "kind": "ip",
    "contextRegex": "cobalt[ -]?strike|\\\\bc2\\\\b"
  },
  "minMatches": 1,
  "technique": "T1071.001",
  "tactic": "Command and Control"
}`;

interface LiveIocsResponse {
  generated_at: string;
  total: number;
  items: EngineIndicator[];
}

/**
 * Per-rule test assertion. Lives alongside the rule in the editor JSON
 * but is stripped before evaluation — the engine doesn't know about
 * tests. UI runs each on every edit and surfaces pass/fail as a
 * test-driven authoring loop.
 */
interface RuleTest {
  name: string;
  indicators: EngineIndicator[];
  /** `fire` = at least one detection on this indicator set; `silent` = none. */
  expect: 'fire' | 'silent';
}

interface RuleSourceParse {
  rule?: DetectionRule;
  tests?: RuleTest[];
  error?: string;
}

const SEV_PILL: Record<string, string> = {
  critical: 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300',
  high: 'border-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-300',
  medium: 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  low: 'border-slate-400/50 bg-slate-400/10 text-slate-600 dark:text-slate-300',
};

function loadSaved(): SavedRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedRule[]) : [];
  } catch {
    return [];
  }
}

/**
 * Parse + shallow-validate the editor JSON. The schema is the engine's
 * DetectionRule with one extension — an optional `tests` array. We pull
 * `tests` off the object before handing it to the engine; the engine
 * never sees it.
 */
function parseRule(src: string): RuleSourceParse {
  let obj: unknown;
  try {
    obj = JSON.parse(src);
  } catch (e) {
    return { error: `JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!obj || typeof obj !== 'object') return { error: 'Rule must be a JSON object.' };
  const o = obj as Record<string, unknown>;
  if (!o.id || typeof o.id !== 'string') return { error: 'Missing required string field "id".' };
  if (!o.name || typeof o.name !== 'string') return { error: 'Missing required string field "name".' };
  if (!o.severity || !['low', 'medium', 'high', 'critical'].includes(o.severity as string)) {
    return { error: '"severity" must be one of low | medium | high | critical.' };
  }
  if (!o.match || typeof o.match !== 'object') return { error: 'Missing required object field "match".' };
  const { tests, ...rest } = o;
  let parsedTests: RuleTest[] | undefined;
  if (tests !== undefined) {
    if (!Array.isArray(tests)) return { error: '"tests" must be an array.' };
    for (const [i, t] of tests.entries()) {
      if (!t || typeof t !== 'object') return { error: `tests[${i}] must be an object.` };
      const tt = t as Record<string, unknown>;
      if (!tt.name || typeof tt.name !== 'string') return { error: `tests[${i}].name missing.` };
      if (tt.expect !== 'fire' && tt.expect !== 'silent') {
        return { error: `tests[${i}].expect must be "fire" or "silent".` };
      }
      if (!Array.isArray(tt.indicators)) return { error: `tests[${i}].indicators must be an array.` };
    }
    parsedTests = tests as RuleTest[];
  }
  return { rule: rest as unknown as DetectionRule, tests: parsedTests };
}

/** Synthetic-event tester input. Either valid JSON array of indicators or
 *  an error message — never partial. */
function parseSyntheticEvents(src: string): { events?: EngineIndicator[]; error?: string } {
  const trimmed = src.trim();
  if (trimmed === '') return { events: [] };
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch (e) {
    return { error: `JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!Array.isArray(obj)) return { error: 'Must be a JSON array of indicators.' };
  for (const [i, e] of obj.entries()) {
    if (!e || typeof e !== 'object') return { error: `events[${i}] must be an object.` };
    const ev = e as Record<string, unknown>;
    if (typeof ev.value !== 'string') return { error: `events[${i}].value must be a string.` };
    if (!['ip', 'url', 'domain', 'hash'].includes(ev.kind as string)) {
      return { error: `events[${i}].kind must be one of ip | url | domain | hash.` };
    }
    if (typeof ev.source !== 'string') return { error: `events[${i}].source must be a string.` };
  }
  return { events: obj as EngineIndicator[] };
}

const SYNTHETIC_EXAMPLE = JSON.stringify(
  [
    {
      value: '198.51.100.42',
      kind: 'ip',
      source: 'c2-intel',
      context: 'Cobalt Strike beacon (TEST-NET-2)',
      reporter: '@testuser',
    },
    { value: 'example-c2.test', kind: 'domain', source: 'threatfox', context: 'cobalt strike infra', reporter: 'a' },
    { value: '203.0.113.7', kind: 'ip', source: 'threatfox', context: 'cobalt strike', reporter: 'b' },
    { value: '203.0.113.7', kind: 'ip', source: 'c2-intel', context: 'cobalt strike', reporter: 'c' },
  ],
  null,
  2
);

type EvalMode = 'live' | 'synthetic';

export default function DetectionLab(): JSX.Element {
  const [src, setSrc] = useState(TEMPLATE);
  const [synthSrc, setSynthSrc] = useState(SYNTHETIC_EXAMPLE);
  const [saved, setSaved] = useState<SavedRule[]>(() => loadSaved());
  const [data, setData] = useState<LiveIocsResponse | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [evalMode, setEvalMode] = useState<EvalMode>('live');
  const [showStarters, setShowStarters] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      /* quota / private mode */
    }
  }, [saved]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFeedError(null);
    fetch('/api/v1/live-iocs')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<LiveIocsResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setFeedError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const parsed = useMemo(() => parseRule(src), [src]);
  const synthetic = useMemo(() => parseSyntheticEvents(synthSrc), [synthSrc]);

  /** Result against whichever event source the user has selected. */
  const result = useMemo(() => {
    if (!parsed.rule) return null;
    if (evalMode === 'synthetic') {
      if (!synthetic.events) return null;
      return evaluateRules([parsed.rule], synthetic.events);
    }
    if (!data) return null;
    return evaluateRules([parsed.rule], data.items);
  }, [parsed.rule, data, evalMode, synthetic.events]);

  const detections: Detection[] = result?.detections ?? [];
  const warning = result?.warnings[0]?.message;

  /** Test-runner — evaluates each rule.tests[i] and reports pass/fail. */
  const testResults = useMemo(() => {
    if (!parsed.rule || !parsed.tests || parsed.tests.length === 0) return null;
    return parsed.tests.map((t) => {
      const r = evaluateRules([parsed.rule!], t.indicators);
      const fired = r.detections.length > 0;
      const passed = t.expect === 'fire' ? fired : !fired;
      return { name: t.name, expect: t.expect, fired, passed };
    });
  }, [parsed.rule, parsed.tests]);

  const testsPassed = testResults?.every((t) => t.passed) ?? null;

  /** Coverage report — across saved rules, what % of live indicators are
   *  covered, broken down by kind. Useful for spotting blind kinds. */
  const coverage = useMemo(() => {
    if (!data) return null;
    const rules: DetectionRule[] = [];
    for (const s of saved) {
      const p = parseRule(s.json);
      if (p.rule) rules.push(p.rule);
    }
    if (rules.length === 0) return { rules: 0, byKind: [] as { kind: string; total: number; covered: number }[] };
    const evalAll = evaluateRules(rules, data.items);
    const coveredValues = new Set<string>();
    for (const d of evalAll.detections) {
      for (const it of d.indicators) coveredValues.add(`${it.kind}:${it.value}`);
    }
    const counts = new Map<string, { total: number; covered: number }>();
    for (const it of data.items) {
      const e = counts.get(it.kind) ?? { total: 0, covered: 0 };
      e.total += 1;
      if (coveredValues.has(`${it.kind}:${it.value}`)) e.covered += 1;
      counts.set(it.kind, e);
    }
    return {
      rules: rules.length,
      byKind: Array.from(counts.entries())
        .map(([kind, c]) => ({ kind, ...c }))
        .sort((a, b) => b.total - a.total),
    };
  }, [data, saved]);

  const saveCurrent = useCallback(() => {
    if (!parsed.rule) return;
    const now = new Date().toISOString();
    setSaved((prev) => {
      const existing = prev.find((s) => s.id === parsed.rule!.id);
      if (existing) {
        return prev.map((s) =>
          s.id === existing.id ? { ...s, name: parsed.rule!.name, json: src, modified: now } : s
        );
      }
      return [{ id: parsed.rule!.id, name: parsed.rule!.name, json: src, created: now, modified: now }, ...prev];
    });
  }, [parsed.rule, src]);

  const deleteSaved = useCallback((id: string) => {
    if (!window.confirm('Delete this saved rule?')) return;
    setSaved((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const exportAll = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          saved.map((s) => JSON.parse(s.json)),
          null,
          2
        ),
      ],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'detection-rules.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [saved]);

  const loadStarter = useCallback((rule: DetectionRule) => {
    setSrc(JSON.stringify(rule, null, 2));
    setShowStarters(false);
  }, []);

  const groups = useMemo(() => groupedStarters(), []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <FlaskConical size={28} className="text-brand-600 dark:text-brand-400" /> Detection Lab
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          Write a detection rule in a small JSON DSL and test it against either the live multi-feed IOC stream or your
          own synthetic events. Same engine that powers the server-side{' '}
          <Link to="/threatintel/detections" className="text-brand-600 dark:text-brand-400 hover:underline">
            Detections
          </Link>{' '}
          pack. Rules saved to this browser only (localStorage). Inline <code>tests</code> array gives you a TDD loop
          for rule authoring.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-6">
          <code>match</code> + optional <code>exclude</code> predicates (kind, source, valueRegex, contextRegex,
          reporterRegex) are AND-ed inside each clause. <code>aggregate</code> {'{ groupBy, minCount, distinctBy }'} for
          consensus, <code>minMatches</code> for a flat threshold. <code>technique</code>/<code>tactic</code>/
          <code>references</code> are MITRE ATT&CK metadata. Regexes are case-insensitive.
        </p>
      </div>

      <ToolDocs path="/dfir/detection-lab" />

      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={() => setShowStarters((s) => !s)}
          aria-expanded={showStarters}
          className="text-xs font-mono px-2.5 py-1 rounded border border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300 inline-flex items-center gap-1 hover:bg-brand-500/15"
        >
          Starter library
          <ChevronDown
            size={11}
            className={showStarters ? 'rotate-180 transition-transform' : 'transition-transform'}
          />
        </button>
        <button
          onClick={() => setSrc(TEMPLATE)}
          className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
        >
          Blank template
        </button>
        <button
          onClick={saveCurrent}
          disabled={!parsed.rule}
          className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-emerald-500/40 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-40 inline-flex items-center gap-1"
        >
          <Save size={11} /> Save
        </button>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1"
        >
          <RefreshCw size={11} /> Refresh feed
        </button>
        {saved.length > 0 && (
          <button
            onClick={exportAll}
            className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1"
          >
            <FileDown size={11} /> Export {saved.length}
          </button>
        )}
      </div>

      {/* Starter library picker — surfaces the curated 12+ rules grouped
          by topic. Click loads into the editor. */}
      {showStarters && (
        <section className="rounded-lg border border-brand-500/30 bg-brand-50/30 dark:bg-brand-900/15 p-4 mb-6">
          <p className="text-xs font-mono text-slate-600 dark:text-slate-400 mb-3">
            Curated production-quality starters. Each declares a MITRE ATT&CK technique and (where useful) demonstrates
            an <code>exclude</code> clause for suppression.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(groups.entries()).map(([group, items]) => (
              <div key={group}>
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">{group}</div>
                <ul className="space-y-1">
                  {items.map((s) => (
                    <li key={s.rule.id}>
                      <button
                        type="button"
                        onClick={() => loadStarter(s.rule)}
                        className="w-full text-left px-2 py-1.5 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/50 bg-white dark:bg-slate-900/40"
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded border ${
                              SEV_PILL[s.rule.severity] ?? SEV_PILL.medium
                            }`}
                          >
                            {s.rule.severity}
                          </span>
                          {s.rule.technique && (
                            <span className="text-[9px] font-mono text-brand-600 dark:text-brand-400">
                              {s.rule.technique}
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] font-medium mt-0.5 text-slate-900 dark:text-slate-100">
                          {s.rule.name}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-3 lg:grid-cols-2 mb-6">
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-2">
            Rule (JSON)
          </h2>
          <textarea
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            rows={22}
            spellCheck={false}
            aria-label="Detection rule JSON"
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand-500/60 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono">
            {parsed.error ? (
              <span className="text-rose-600 dark:text-rose-400 inline-flex items-center gap-1">
                <AlertTriangle size={11} /> {parsed.error}
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                <CheckCircle2 size={11} /> valid rule
              </span>
            )}
            {parsed.rule?.technique && (
              <span className="text-brand-600 dark:text-brand-400">
                {parsed.rule.technique}
                {parsed.rule.tactic ? ` · ${parsed.rule.tactic}` : ''}
              </span>
            )}
            {testsPassed !== null && (
              <span
                className={
                  testsPassed
                    ? 'text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1'
                    : 'text-rose-600 dark:text-rose-400 inline-flex items-center gap-1'
                }
              >
                {testsPassed ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                tests {testResults!.filter((t) => t.passed).length}/{testResults!.length}
              </span>
            )}
          </div>
          {warning && (
            <p className="mt-1 text-[11px] font-mono text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
              <AlertTriangle size={11} /> {warning}
            </p>
          )}
          {testResults && testResults.length > 0 && (
            <details className="mt-3" open={!testsPassed}>
              <summary className="text-[11px] font-mono text-slate-500 cursor-pointer">
                Test cases ({testResults.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {testResults.map((t, i) => (
                  <li key={`${t.name}-${i}`} className="text-[12px] font-mono flex items-center gap-2">
                    {t.passed ? (
                      <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle size={12} className="text-rose-500 shrink-0" />
                    )}
                    <span className="truncate">{t.name}</span>
                    <span className="text-slate-500">
                      expected {t.expect} · {t.fired ? 'fired' : 'silent'}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-2">
            Saved rules ({saved.length})
          </h2>
          {saved.length === 0 ? (
            <p className="text-[12px] text-slate-500 dark:text-slate-400 font-mono">
              None yet. Edit a rule and hit Save — stored in this browser only.
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-[28rem] overflow-y-auto">
              {saved.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded border border-slate-200 dark:border-slate-800 px-2.5 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => setSrc(s.json)}
                    className="min-w-0 flex-1 text-left"
                    title="Load into editor"
                  >
                    <div className="text-[12px] font-mono text-slate-900 dark:text-slate-100 truncate">{s.name}</div>
                    <div className="text-[10px] font-mono text-slate-500">
                      {s.id} · modified {new Date(s.modified).toLocaleString()}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSaved(s.id)}
                    aria-label="delete saved rule"
                    className="shrink-0 text-slate-400 hover:text-rose-500"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Coverage report — only meaningful with saved rules + live feed. */}
          {coverage && coverage.rules > 0 && coverage.byKind.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2">
                Coverage across {coverage.rules} saved rule{coverage.rules === 1 ? '' : 's'}
              </div>
              <ul className="space-y-1.5">
                {coverage.byKind.map((c) => {
                  const pct = c.total === 0 ? 0 : Math.round((c.covered / c.total) * 100);
                  return (
                    <li key={c.kind} className="text-[11px] font-mono">
                      <div className="flex items-baseline justify-between">
                        <span className="uppercase text-slate-500">{c.kind}</span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {c.covered}/{c.total} ({pct}%)
                        </span>
                      </div>
                      <div className="mt-0.5 h-1 bg-slate-100 dark:bg-slate-800 rounded">
                        <div className="h-full bg-brand-500 rounded transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
              Evaluation
            </h2>
            <div className="inline-flex rounded border border-slate-200 dark:border-slate-800 overflow-hidden">
              <button
                onClick={() => setEvalMode('live')}
                className={
                  evalMode === 'live'
                    ? 'text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                    : 'text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 text-slate-500'
                }
              >
                Live feed
              </button>
              <button
                onClick={() => setEvalMode('synthetic')}
                className={
                  evalMode === 'synthetic'
                    ? 'text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                    : 'text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 text-slate-500'
                }
              >
                Synthetic events
              </button>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            {evalMode === 'live'
              ? loading
                ? 'loading live feed…'
                : feedError
                  ? `feed error: ${feedError}`
                  : data
                    ? `${data.total} indicators · snapshot ${new Date(data.generated_at).toLocaleString()}`
                    : ''
              : synthetic.error
                ? `events: ${synthetic.error}`
                : `${synthetic.events?.length ?? 0} synthetic indicators`}
          </span>
        </div>

        {evalMode === 'synthetic' && (
          <div className="mb-3">
            <p className="text-[11px] font-mono text-slate-500 mb-1.5">
              Paste a JSON array of indicators (same shape as the live feed). Useful for testing a rule against a known
              event set before going against the live stream.
            </p>
            <textarea
              value={synthSrc}
              onChange={(e) => setSynthSrc(e.target.value)}
              rows={8}
              spellCheck={false}
              aria-label="Synthetic events JSON"
              className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand-500/60 focus:outline-none"
            />
          </div>
        )}

        {!parsed.rule ? (
          <p className="text-[12px] font-mono text-slate-500">Fix the rule JSON to evaluate.</p>
        ) : detections.length === 0 ? (
          <p className="text-[12px] font-mono text-slate-500 inline-flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-500" /> Rule is valid but did not fire on this event set.
          </p>
        ) : (
          <ul className="space-y-2">
            {detections.map((d, i) => (
              <li
                key={`${d.rule_id}:${d.group_key ?? ''}:${i}`}
                className="rounded border border-slate-200 dark:border-slate-800 p-3"
              >
                <div className="flex items-baseline gap-2 flex-wrap mb-1">
                  <span
                    className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEV_PILL[d.severity] ?? SEV_PILL.medium}`}
                  >
                    {d.severity}
                  </span>
                  <span className="font-display font-semibold">{d.rule_name}</span>
                  <span className="text-[11px] font-mono text-slate-500">×{d.match_count}</span>
                  {d.technique && (
                    <a
                      href={`https://attack.mitre.org/techniques/${d.technique.replace('.', '/')}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-brand-500/40 text-brand-600 dark:text-brand-400 hover:bg-brand-500/10"
                      title={d.tactic ? `ATT&CK ${d.technique} — ${d.tactic}` : `ATT&CK ${d.technique}`}
                    >
                      {d.technique}
                    </a>
                  )}
                  {d.group_key && (
                    <code className="text-[11px] font-mono text-brand-600 dark:text-brand-400 break-all">
                      {d.group_key}
                    </code>
                  )}
                </div>
                <ul className="mt-1.5 space-y-1">
                  {d.indicators.map((it, j) => (
                    <li
                      key={`${it.source}:${it.value}:${j}`}
                      className="text-[12px] font-mono flex flex-wrap items-baseline gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-1 last:border-0"
                    >
                      <span className="text-[10px] uppercase tracking-wider text-slate-500">{it.kind}</span>
                      <code className="text-slate-800 dark:text-slate-200 break-all">{it.value}</code>
                      <span className="text-slate-500">{it.source}</span>
                      {it.context && <span className="text-slate-400 italic">· {it.context}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
          References
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-slate-600 dark:text-slate-400">
          <li>
            <Link to="/threatintel/detections" className="text-brand-600 dark:text-brand-400 hover:underline">
              Server-side Detections — the curated pack on this engine
            </Link>
          </li>
          <li>
            <Link to="/threatintel/live-iocs" className="text-brand-600 dark:text-brand-400 hover:underline">
              Live IOC stream — the data this evaluates against
            </Link>
          </li>
          <li>
            <Link to="/dfir/rule-playground" className="text-brand-600 dark:text-brand-400 hover:underline">
              YARA / Sigma Playground — for file/log rule testing
            </Link>
          </li>
          <li>
            <a
              href="https://attack.mitre.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              MITRE ATT&CK <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
          <li>
            <a
              href="https://github.com/SigmaHQ/sigma"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              SigmaHQ <ExternalLink size={11} aria-hidden="true" />
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
