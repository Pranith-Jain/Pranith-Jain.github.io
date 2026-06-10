import { useEffect, useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, AlertTriangle, Target, Search, GitBranch } from 'lucide-react';
import { SEVERITY_TONE, type Severity } from '../../components/severity';

interface Insight {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'informational';
  title: string;
  description: string;
  entities: string[];
  sources: string[];
  implication: string;
  recommendation: string;
}

interface CorrelateResponse {
  generated_at: string;
  insights: Insight[];
  total: number;
  critical: number;
  high: number;
}

// Insight severities map onto the canonical Severity union ('informational' → 'info').
const toSeverity = (s: Insight['severity']): Severity => (s === 'informational' ? 'info' : s);

export default function CrossCorrelate(): JSX.Element {
  const [data, setData] = useState<CorrelateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sector, setSector] = useState('');

  function load(sectorFilter?: string) {
    setLoading(true);
    setError(null);
    const body: Record<string, string> = {};
    if (sectorFilter) body.sector = sectorFilter;
    fetch('/api/v1/threat-intel/correlate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Couldn't correlate (HTTP ${r.status}).`);
        return r.json() as Promise<CorrelateResponse>;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
          <GitBranch size={28} className="text-brand-600 dark:text-brand-400" /> Cross-Correlation Intelligence
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-3xl">
          Connects CVEs, actors, sectors, collection health, and detection rules to surface actionable intelligence gaps
          the individual views miss.
        </p>
      </div>

      {/* Sector filter */}
      <div className="mb-6 flex gap-3">
        <input
          type="text"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(sector)}
          placeholder="Filter by sector (e.g. finance, healthcare, energy)…"
          className="flex-1 text-sm px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-e1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        />
        <button
          type="button"
          onClick={() => load(sector)}
          className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-brand-600 text-white hover:bg-brand-700 transition-colors"
        >
          <Search size={14} /> Correlate
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <svg
              className="h-8 w-8 animate-spin text-brand-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
            </svg>
            <p className="text-xs font-mono text-slate-400">Correlating intelligence sources…</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
              <p className="text-mini font-mono text-slate-500 mb-1">Insights</p>
              <p className="text-2xl font-bold font-display">{data.total}</p>
            </div>
            <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 p-4">
              <p className="text-mini font-mono text-rose-600 dark:text-rose-400 mb-1">Critical</p>
              <p className="text-2xl font-bold font-display text-rose-600 dark:text-rose-400">{data.critical}</p>
            </div>
            <div className="rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20 p-4">
              <p className="text-mini font-mono text-orange-600 dark:text-orange-400 mb-1">High</p>
              <p className="text-2xl font-bold font-display text-orange-600 dark:text-orange-400">{data.high}</p>
            </div>
          </div>

          {/* Insights */}
          <div className="space-y-3">
            {data.insights.map((insight, i) => (
              <div key={i} className={`rounded-xl border p-4 ${SEVERITY_TONE[toSeverity(insight.severity)]}`}>
                <div className="flex items-start gap-3">
                  <span
                    className={`text-micro font-mono px-1.5 py-0.5 rounded border shrink-0 ${SEVERITY_TONE[toSeverity(insight.severity)]}`}
                  >
                    {insight.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold">{insight.title}</h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{insight.description}</p>

                    {/* Entities */}
                    {insight.entities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {insight.entities.map((e, j) => (
                          <span
                            key={j}
                            className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                          >
                            {e}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Implication + recommendation */}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-2.5 rounded-lg bg-white/60 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                        <p className="text-micro font-mono uppercase tracking-wider text-rose-500 mb-1">Implication</p>
                        <p className="text-mini text-slate-600 dark:text-slate-400">{insight.implication}</p>
                      </div>
                      <div className="p-2.5 rounded-lg bg-white/60 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                        <p className="text-micro font-mono uppercase tracking-wider text-emerald-500 mb-1">
                          Recommendation
                        </p>
                        <p className="text-mini text-slate-600 dark:text-slate-400">{insight.recommendation}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {data.insights.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <Target size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">
                No correlated insights — all sources healthy and no cross-reference gaps detected.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
