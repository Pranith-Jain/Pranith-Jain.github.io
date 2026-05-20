import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  FlaskConical,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Save,
  Trash2,
  FileDown,
  RefreshCw,
} from 'lucide-react';
import {
  evaluateRules,
  type DetectionRule,
  type EngineIndicator,
  type Detection,
} from '../../lib/dfir/detection-engine';

const STORAGE_KEY = 'dfir-detection-rules:v1';

interface SavedRule {
  id: string;
  name: string;
  json: string;
  created: string;
  modified: string;
}

const TEMPLATE = `{
  "id": "my-rule",
  "name": "Untitled detection",
  "severity": "medium",
  "description": "TODO: what does this catch and why is it actionable?",
  "match": {
    "kind": "ip",
    "contextRegex": "cobalt[ -]?strike|\\\\bc2\\\\b"
  },
  "minMatches": 1
}`;

const SAMPLE_CONSENSUS = `{
  "id": "ip-in-3-feeds",
  "name": "IP confirmed by 3+ independent feeds",
  "severity": "high",
  "description": "Same IP independently reported by 3 or more feeds.",
  "match": { "kind": "ip" },
  "aggregate": { "groupBy": "value", "minCount": 3, "distinctBy": "source" }
}`;

const SAMPLE_CONTEXT = `{
  "id": "stealer-tagged",
  "name": "Infostealer-tagged indicator",
  "severity": "high",
  "description": "Any indicator whose context names a known stealer family.",
  "match": {
    "contextRegex": "redline|vidar|lumma|stealc|raccoon|stealer"
  },
  "minMatches": 1
}`;

interface LiveIocsResponse {
  generated_at: string;
  total: number;
  items: EngineIndicator[];
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

/** Parse + shallow-validate the editor JSON into a DetectionRule. */
function parseRule(src: string): { rule?: DetectionRule; error?: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(src);
  } catch (e) {
    return { error: `JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!obj || typeof obj !== 'object') return { error: 'Rule must be a JSON object.' };
  const r = obj as Partial<DetectionRule>;
  if (!r.id || typeof r.id !== 'string') return { error: 'Missing required string field "id".' };
  if (!r.name || typeof r.name !== 'string') return { error: 'Missing required string field "name".' };
  if (!r.severity || !['low', 'medium', 'high', 'critical'].includes(r.severity)) {
    return { error: '"severity" must be one of low | medium | high | critical.' };
  }
  if (!r.match || typeof r.match !== 'object') return { error: 'Missing required object field "match".' };
  return { rule: r as DetectionRule };
}

export default function DetectionLab(): JSX.Element {
  const [src, setSrc] = useState(TEMPLATE);
  const [saved, setSaved] = useState<SavedRule[]>(() => loadSaved());
  const [data, setData] = useState<LiveIocsResponse | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

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

  const result = useMemo(() => {
    if (!parsed.rule || !data) return null;
    return evaluateRules([parsed.rule], data.items);
  }, [parsed.rule, data]);

  const detections: Detection[] = result?.detections ?? [];
  const warning = result?.warnings[0]?.message;

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
      {
        type: 'application/json',
      }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'detection-rules.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [saved]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <FlaskConical size={28} className="text-brand-600 dark:text-brand-400" /> Detection Lab
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          Write a detection rule in a small JSON DSL and evaluate it — in your browser — against the live multi-feed IOC
          stream. This is the same engine that powers the server-side{' '}
          <Link to="/threatintel/detections" className="text-brand-600 dark:text-brand-400 hover:underline">
            Detections
          </Link>{' '}
          pack. Rules are saved to this browser only (localStorage).
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-6">
          <code>match</code> predicates (kind, source, valueRegex, contextRegex, reporterRegex) are AND-ed. Add{' '}
          <code>aggregate</code> {'{ groupBy, minCount, distinctBy }'} for cross-feed consensus, or{' '}
          <code>minMatches</code> for a flat threshold. Regexes are case-insensitive.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={() => setSrc(TEMPLATE)}
          className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
        >
          Template
        </button>
        <button
          onClick={() => setSrc(SAMPLE_CONSENSUS)}
          className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
        >
          Sample: cross-feed consensus
        </button>
        <button
          onClick={() => setSrc(SAMPLE_CONTEXT)}
          className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
        >
          Sample: context match
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

      <div className="grid gap-3 lg:grid-cols-2 mb-6">
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-2">
            Rule (JSON)
          </h2>
          <textarea
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            rows={20}
            spellCheck={false}
            aria-label="Detection rule JSON"
            className="w-full rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand-500/60 focus:outline-none"
          />
          {parsed.error ? (
            <p className="mt-2 text-[11px] font-mono text-rose-600 dark:text-rose-400 inline-flex items-center gap-1">
              <AlertTriangle size={11} /> {parsed.error}
            </p>
          ) : (
            <p className="mt-2 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
              <CheckCircle2 size={11} /> valid rule
            </p>
          )}
          {warning && (
            <p className="mt-1 text-[11px] font-mono text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
              <AlertTriangle size={11} /> {warning}
            </p>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-2">
            Saved rules ({saved.length})
          </h2>
          {saved.length === 0 ? (
            <p className="text-[12px] text-slate-500 dark:text-slate-500 font-mono">
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
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
            Evaluation
          </h2>
          <span className="text-[11px] font-mono text-slate-500">
            {loading
              ? 'loading live feed…'
              : feedError
                ? `feed error: ${feedError}`
                : data
                  ? `${data.total} indicators · snapshot ${new Date(data.generated_at).toLocaleString()}`
                  : ''}
          </span>
        </div>

        {!parsed.rule ? (
          <p className="text-[12px] font-mono text-slate-500">Fix the rule JSON to evaluate.</p>
        ) : detections.length === 0 ? (
          <p className="text-[12px] font-mono text-slate-500 inline-flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-500" /> Rule is valid but did not fire on the current
            snapshot.
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
