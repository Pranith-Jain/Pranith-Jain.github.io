import { useEffect, useState } from 'react';
import { DataState } from '../../components/DataState';
import { Activity, AlertTriangle, CheckCircle2, HelpCircle, Clock } from 'lucide-react';

interface CollectorSlo {
  id: string;
  label: string;
  page_path: string;
  api_path: string;
  status: 'ok' | 'degraded' | 'down' | 'cold' | 'healthy';
  reason: string;
  reliability?: string;
  category?: string;
  description?: string;
  upstream_age_s?: number;
  metrics?: Record<string, number>;
}
interface SloResponse {
  total_sources: number;
  healthy: number;
  degraded: number;
  down: number;
  cold: number;
  overall: string;
  rows: CollectorSlo[];
}

const STATUS_STYLES: Record<string, string> = {
  healthy: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-900',
  ok: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-900',
  degraded: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-900',
  down: 'text-rose-600 bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-900',
  cold: 'text-slate-500 bg-slate-50 dark:bg-[rgb(var(--surface-200))] border-slate-300 dark:border-[rgb(var(--border-400))]',
  unknown:
    'text-slate-500 bg-slate-50 dark:bg-[rgb(var(--surface-200))] border-slate-300 dark:border-[rgb(var(--border-400))]',
};

const RELIABILITY_BADGE: Record<string, string> = {
  A: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  B: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  C: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  D: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  E: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  F: 'bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-500',
};

export default function CollectionSlo(): JSX.Element {
  const [data, setData] = useState<SloResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/threat-intel/collection-slo')
      .then((r) => r.json() as Promise<SloResponse>)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const sources = data?.rows ?? [];
  const filtered = filter ? sources.filter((s) => s.status === filter) : sources;

  function statusToDisplay(s: string): string {
    if (s === 'ok') return 'healthy';
    if (s === 'cold') return 'unknown';
    return s;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3">
          <Activity size={28} className="text-brand-600 dark:text-brand-400" /> Collection SLO
        </h1>
        <p className="text-muted mt-2 max-w-3xl">
          Live health status of every intelligence collector, source, and feed. Green = data flowing within 6h SLA.
        </p>
      </div>

      <DataState loading={loading} error={error} rows={8}>
        {data && (
          <>
            {/* Down-source alert banner */}
            {data.down > 0 && (
              <div className="mb-6 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 p-4">
                <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs font-medium mb-2">
                  <AlertTriangle size={14} />
                  {data.down} collector(s) down — intelligence gap detected
                </div>
                <div className="space-y-1">
                  {data.rows
                    .filter((s) => s.status === 'down')
                    .map((s) => (
                      <p key={s.id} className="text-mini text-slate-700 dark:text-slate-300">
                        <span className="font-mono">{s.label}</span> — {s.reason}
                      </p>
                    ))}
                </div>
              </div>
            )}

            {data.degraded > 0 && (
              <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-4">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-xs font-medium mb-1">
                  <Clock size={14} />
                  {data.degraded} collector(s) degraded — stale data
                </div>
              </div>
            )}

            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              {[
                { label: 'Total sources', value: data.total_sources, icon: Activity, color: '' },
                {
                  label: 'Healthy',
                  value: data.healthy,
                  icon: CheckCircle2,
                  color: 'text-emerald-500',
                  onClick: () => setFilter(filter === 'ok' ? null : 'ok'),
                  selected: filter === 'ok',
                },
                {
                  label: 'Degraded',
                  value: data.degraded,
                  icon: Clock,
                  color: 'text-amber-500',
                  onClick: () => setFilter(filter === 'degraded' ? null : 'degraded'),
                  selected: filter === 'degraded',
                },
                {
                  label: 'Down',
                  value: data.down,
                  icon: AlertTriangle,
                  color: 'text-rose-500',
                  onClick: () => setFilter(filter === 'down' ? null : 'down'),
                  selected: filter === 'down',
                },
                {
                  label: 'Cold / Unknown',
                  value: data.cold,
                  icon: HelpCircle,
                  color: 'text-slate-400',
                  onClick: () => setFilter(filter === 'cold' ? null : 'cold'),
                  selected: filter === 'cold',
                },
              ].map((k) => {
                const Icon = k.icon;
                return (
                  <button
                    key={k.label}
                    type="button"
                    onClick={k.onClick}
                    className={`rounded-xl border p-4 text-left transition-colors ${k.selected ? 'border-brand-500/50 bg-brand-500/5' : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:border-brand-500/30'}`}
                  >
                    <div className="flex items-center gap-1.5 text-mini font-mono text-slate-500 mb-1">
                      <Icon size={12} className={k.color} /> {k.label}
                    </div>
                    <p className={`text-2xl font-bold font-display ${k.color}`}>{k.value}</p>
                  </button>
                );
              })}
            </div>

            {/* Source table */}
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] text-mini font-mono text-slate-500 uppercase tracking-wider">
                      <th scope="col" className="text-left px-4 py-3 font-medium">
                        Source
                      </th>
                      <th scope="col" className="text-left px-4 py-3 font-medium">
                        Rel.
                      </th>
                      <th scope="col" className="text-left px-4 py-3 font-medium">
                        Category
                      </th>
                      <th scope="col" className="text-left px-4 py-3 font-medium">
                        Status
                      </th>
                      <th scope="col" className="text-right px-4 py-3 font-medium">
                        Age
                      </th>
                      <th scope="col" className="text-right px-4 py-3 font-medium">
                        Uptime
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filtered.map((s) => (
                      <tr
                        key={s.id}
                        className="hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-200)/0.3)] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium">{s.label}</div>
                          <div className="text-mini font-mono text-slate-400">{s.id}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-micro font-mono px-1.5 py-0.5 rounded ${RELIABILITY_BADGE[s.reliability ?? ''] ?? ''}`}
                          >
                            {s.reliability ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-mini font-mono text-slate-500">{s.category ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-micro font-mono px-2 py-0.5 rounded border ${STATUS_STYLES[s.status] ?? ''}`}
                          >
                            {statusToDisplay(s.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-mini font-mono text-slate-500">
                          {s.upstream_age_s !== undefined ? `${Math.round(s.upstream_age_s / 3600)}h` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`text-mini font-mono ${s.metrics?.sources_ok !== undefined ? 'text-emerald-500' : 'text-slate-400'}`}
                          >
                            {s.metrics?.sources_ok ?? '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </DataState>
    </div>
  );
}
