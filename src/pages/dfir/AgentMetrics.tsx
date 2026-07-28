import { useEffect, useState } from 'react';
import { adminAuthHeaders } from '../../lib/admin-token';

interface AgentMetricsData {
  totalInvestigations: number;
  successRate: number;
  avgQualityScore: number;
  avgStepsPerInvestigation: number;
  avgDurationMs: number;
  errorRate: number;
  topTools: Array<{ tool: string; count: number; avgDurationMs: number; successRate: number }>;
  topModels: Array<{ model: string; count: number; avgScore: number }>;
  recentErrors: Array<{ query: string; error: string; at: string }>;
  features: {
    parallelBurst: number;
    selfCorrection: number;
    avgScoreDelta: number;
    routingRefinements: number;
    avgFindings: number;
  };
}

function Stat({ label, value, suffix }: { label: string; value: string | number; suffix?: string }): JSX.Element {
  return (
    <div className="surface-card p-3">
      <div className="text-micro font-mono uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        {value}
        {suffix ? <span className="text-sm font-normal text-slate-400">{suffix}</span> : null}
      </div>
    </div>
  );
}

export default function AgentMetrics(): JSX.Element {
  const [data, setData] = useState<AgentMetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/agent/metrics', { headers: adminAuthHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as AgentMetricsData;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="p-8 text-center font-mono text-sm text-slate-500">Loading metrics…</div>;
  if (error)
    return <div className="p-8 text-center font-mono text-sm text-rose-600">Failed to load metrics: {error}</div>;
  if (!data || data.totalInvestigations === 0)
    return <div className="p-8 text-center font-mono text-sm text-slate-500">No investigations recorded yet.</div>;

  const f = data.features;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Investigations" value={data.totalInvestigations} />
        <Stat label="Success" value={data.successRate} suffix="%" />
        <Stat label="Avg Quality" value={data.avgQualityScore} suffix="/100" />
        <Stat label="Avg Steps" value={data.avgStepsPerInvestigation} />
        <Stat label="Avg Duration" value={(data.avgDurationMs / 1000).toFixed(1)} suffix="s" />
        <Stat label="Error Rate" value={data.errorRate} suffix="%" />
      </div>

      <div>
        <h3 className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-2">Feature Telemetry</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Parallel Burst" value={f.parallelBurst} />
          <Stat label="Self-Correction" value={f.selfCorrection} />
          <Stat label="Avg Score Δ" value={f.avgScoreDelta > 0 ? `+${f.avgScoreDelta}` : f.avgScoreDelta} />
          <Stat label="Route Refinements" value={f.routingRefinements} />
          <Stat label="Avg Findings" value={f.avgFindings} />
        </div>
      </div>

      <div>
        <h3 className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-2">
          Top Tools (latency / success)
        </h3>
        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] text-left font-mono text-micro uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">Tool</th>
                <th className="px-3 py-2 text-right">Calls</th>
                <th className="px-3 py-2 text-right">Avg ms</th>
                <th className="px-3 py-2 text-right">Success</th>
              </tr>
            </thead>
            <tbody>
              {data.topTools.map((t) => (
                <tr key={t.tool} className="border-b border-slate-100 dark:border-[rgb(var(--border-400)/0.5)]">
                  <td className="px-3 py-1.5 font-mono text-slate-800 dark:text-slate-200">{t.tool}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{t.count}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{t.avgDurationMs}</td>
                  <td
                    className={`px-3 py-1.5 text-right tabular-nums font-semibold ${
                      t.successRate < 50 ? 'text-rose-600' : t.successRate < 80 ? 'text-amber-600' : 'text-emerald-600'
                    }`}
                  >
                    {t.successRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-2">Top Models</h3>
          <div className="surface-card divide-y divide-slate-100 dark:divide-[rgb(var(--border-400)/0.5)]">
            {data.topModels.map((m) => (
              <div key={m.model} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-mono text-slate-800 dark:text-slate-200">{m.model}</span>
                <span className="tabular-nums text-slate-500">
                  {m.count}× · avg {m.avgScore}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-2">Recent Errors</h3>
          <div className="surface-card divide-y divide-slate-100 dark:divide-[rgb(var(--border-400)/0.5)]">
            {data.recentErrors.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">None.</div>
            ) : (
              data.recentErrors.map((e, i) => (
                <div key={i} className="px-3 py-2 text-sm">
                  <div className="font-mono text-slate-800 dark:text-slate-200 truncate">{e.query}</div>
                  <div className="text-rose-600 text-xs truncate">{e.error}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
