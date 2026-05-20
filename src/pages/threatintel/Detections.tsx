import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, RefreshCw, Search, FlaskConical, ChevronRight } from 'lucide-react';
import { DataState } from '../../components/DataState';

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface DetIndicator {
  value: string;
  kind: 'ip' | 'url' | 'domain' | 'hash';
  source: string;
  reporter?: string;
  context?: string;
  reference_url?: string;
  observed_at?: string;
}

interface Detection {
  rule_id: string;
  rule_name: string;
  severity: Severity;
  description?: string;
  match_count: number;
  group_key?: string;
  indicators: DetIndicator[];
  first_observed?: string;
  last_observed?: string;
}

interface DetectionsResponse {
  generated_at: string;
  source_total: number;
  rule_count: number;
  severity_counts: Record<string, number>;
  detections: Detection[];
  warnings: { rule_id: string; message: string }[];
}

const SEV_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

const SEV_PILL: Record<Severity, string> = {
  critical: 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300',
  high: 'border-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-300',
  medium: 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  low: 'border-slate-400/50 bg-slate-400/10 text-slate-600 dark:text-slate-300',
};

const KIND_PILL: Record<DetIndicator['kind'], string> = {
  ip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  url: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  domain: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  hash: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

function shortRel(iso?: string): string {
  if (!iso) return 'no timestamp';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'no timestamp';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function DetectionCard({ d }: { d: Detection }): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        aria-expanded={open}
      >
        <span
          className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 mt-0.5 ${SEV_PILL[d.severity]}`}
        >
          {d.severity}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-display font-semibold text-slate-900 dark:text-slate-100">{d.rule_name}</span>
            <span className="text-[11px] font-mono text-slate-500">×{d.match_count}</span>
          </div>
          {d.group_key && (
            <code className="text-[11px] font-mono text-brand-600 dark:text-brand-400 break-all">{d.group_key}</code>
          )}
          {d.description && (
            <p className="text-[12px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">{d.description}</p>
          )}
          <div className="text-[11px] font-mono text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="text-slate-400">rule: {d.rule_id}</span>
            {d.last_observed && <span>last seen {shortRel(d.last_observed)}</span>}
            <span>
              {d.indicators.length} indicator{d.indicators.length === 1 ? '' : 's'} shown
            </span>
          </div>
        </div>
        <ChevronRight
          size={16}
          className={`shrink-0 mt-1 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <ul className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/60">
          {d.indicators.map((it, i) => (
            <li key={`${it.source}:${it.value}:${i}`} className="px-4 py-2 flex items-center gap-3">
              <span
                className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${KIND_PILL[it.kind]}`}
              >
                {it.kind}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12px] text-slate-900 dark:text-slate-100 truncate" title={it.value}>
                  {it.value}
                </div>
                <div className="text-[11px] font-mono text-slate-500 flex flex-wrap gap-x-2">
                  <span>{it.source}</span>
                  {it.context && (
                    <span className="text-slate-400 italic truncate max-w-[44ch]" title={it.context}>
                      · {it.context}
                    </span>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-mono text-slate-500" title={it.observed_at ?? ''}>
                {shortRel(it.observed_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Detections(): JSX.Element {
  const [data, setData] = useState<DetectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sevFilter, setSevFilter] = useState<Set<Severity>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/v1/detections')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<DetectionsResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    if (!data) return [] as Detection[];
    const q = query.trim().toLowerCase();
    return data.detections.filter((d) => {
      if (sevFilter.size > 0 && !sevFilter.has(d.severity)) return false;
      if (!q) return true;
      return (
        d.rule_name.toLowerCase().includes(q) ||
        d.rule_id.toLowerCase().includes(q) ||
        (d.group_key ?? '').toLowerCase().includes(q) ||
        d.indicators.some((it) => it.value.toLowerCase().includes(q))
      );
    });
  }, [data, query, sevFilter]);

  const toggleSev = (s: Severity) =>
    setSevFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <ShieldAlert size={28} className="text-brand-600 dark:text-brand-400" /> Detections
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          A curated detection-rule pack evaluated hourly against the unified live-IOC stream. Each card is a rule that
          fired — cross-feed consensus, C2 / ransomware / infostealer tagging, and campaign clustering — with the
          indicators that triggered it.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-6">
          Want to write your own?{' '}
          <Link
            to="/dfir/detection-lab"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            <FlaskConical size={11} /> Detection Lab
          </Link>{' '}
          runs the same engine against the live feed in your browser.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by rule, group key, or indicator…"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Filter detections"
            />
          </div>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
          >
            <RefreshCw size={12} /> refresh
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <span className="text-[11px] font-mono text-slate-500 mr-1">severity:</span>
          {SEV_ORDER.map((s) => {
            const active = sevFilter.has(s);
            const n = data?.severity_counts[s] ?? 0;
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSev(s)}
                className={`text-[11px] font-mono px-2 py-1 rounded border ${
                  active ? SEV_PILL[s] : 'border-slate-300 dark:border-slate-700 text-slate-500'
                }`}
              >
                {s} <span className="opacity-70">· {n}</span>
              </button>
            );
          })}
          {sevFilter.size > 0 && (
            <button
              type="button"
              onClick={() => setSevFilter(new Set())}
              className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline ml-2"
            >
              clear
            </button>
          )}
        </div>
        {data && (
          <p className="text-[11px] font-mono text-slate-500 mt-3">
            Showing <span className="text-slate-700 dark:text-slate-300">{filtered.length}</span> of{' '}
            <span className="text-slate-700 dark:text-slate-300">{data.detections.length}</span> detections ·{' '}
            <span className="text-slate-700 dark:text-slate-300">{data.rule_count}</span> rules ·{' '}
            <span className="text-slate-700 dark:text-slate-300">{data.source_total}</span> indicators evaluated ·
            snapshot <span className="text-slate-700 dark:text-slate-300">{shortRel(data.generated_at)}</span>
          </p>
        )}
      </section>

      <DataState
        loading={loading}
        error={error}
        empty={filtered.length === 0}
        emptyLabel={
          query || sevFilter.size > 0
            ? 'No detections match the current filter.'
            : 'No rules fired on the current snapshot — the feeds are quiet or the rule pack is conservative.'
        }
        onRetry={() => setRefreshKey((k) => k + 1)}
        rows={6}
      >
        <ul className="space-y-2">
          {filtered.map((d) => (
            <DetectionCard key={`${d.rule_id}:${d.group_key ?? ''}`} d={d} />
          ))}
        </ul>
      </DataState>
    </div>
  );
}
