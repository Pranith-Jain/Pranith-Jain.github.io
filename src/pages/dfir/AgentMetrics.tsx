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
    avgCostUsd: number;
  };
}

interface ProviderHealthData {
  healthy: boolean;
  lastRateLimit: number;
  consecutiveFailures: number;
  successes: number;
  failures: number;
  avgResponseMs: number;
}

interface MemoryEntry {
  query: string;
  queryType: string;
  actors: string[];
  cves: string[];
  mitre: string[];
  keyFindings: string[];
  qualityScore: number;
  completedAt: string;
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
  const [providers, setProviders] = useState<Record<string, ProviderHealthData> | null>(null);
  const [memory, setMemory] = useState<MemoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const headers = adminAuthHeaders();
    Promise.all([
      fetch('/api/v1/agent/metrics', { headers }).then(async (r) => {
        if (!r.ok) throw new Error(`metrics HTTP ${r.status}`);
        return (await r.json()) as AgentMetricsData;
      }),
      fetch('/api/v1/agent/provider-health', { headers })
        .then((r) => (r.ok ? (r.json() as Promise<Record<string, ProviderHealthData>>) : null))
        .catch(() => null),
      fetch('/api/v1/agent/memory?limit=15', { headers })
        .then((r) => (r.ok ? (r.json() as Promise<{ investigations: MemoryEntry[] }>) : null))
        .catch(() => null),
    ])
      .then(([metrics, prov, mem]) => {
        if (cancelled) return;
        setData(metrics);
        setProviders(prov);
        setMemory(mem?.investigations ?? null);
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
        <Stat label="Avg Cost" value={`$${f.avgCostUsd.toFixed(4)}`} />
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

      {providers && (
        <div>
          <h3 className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-2">LLM Provider Health</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {Object.entries(providers).map(([name, p]) => (
              <div key={name} className="surface-card p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{name}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-micro font-mono font-bold ${
                      p.healthy ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                    }`}
                  >
                    {p.healthy ? 'HEALTHY' : 'DEGRADED'}
                  </span>
                </div>
                <div className="mt-2 text-micro font-mono text-slate-500">
                  {p.avgResponseMs > 0 ? `${Math.round(p.avgResponseMs)}ms · ` : ''}
                  {p.successes}✓ / {p.failures}✗
                  {p.consecutiveFailures > 0 ? ` · ${p.consecutiveFailures} consec. fails` : ''}
                  {p.lastRateLimit > 0 ? ' · rate-limited' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {memory && memory.length > 0 && (
        <div>
          <h3 className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-2">Investigation Memory</h3>
          <div className="surface-card divide-y divide-slate-100 dark:divide-[rgb(var(--border-400)/0.5)]">
            {memory.map((m, i) => (
              <div key={i} className="px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-slate-800 dark:text-slate-200 truncate">{m.query}</span>
                  <span className="shrink-0 tabular-nums text-micro text-slate-500">{m.qualityScore}/100</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1 text-micro font-mono text-slate-500">
                  <span className="rounded bg-slate-100 px-1 dark:bg-slate-800">{m.queryType}</span>
                  {m.actors.slice(0, 2).map((a) => (
                    <span key={a} className="rounded bg-rose-500/10 px-1 text-rose-600">
                      {a}
                    </span>
                  ))}
                  {m.cves.slice(0, 2).map((c) => (
                    <span key={c} className="rounded bg-amber-500/10 px-1 text-amber-600">
                      {c}
                    </span>
                  ))}
                  {m.mitre.slice(0, 3).map((t) => (
                    <span key={t} className="rounded bg-cyan-500/10 px-1 text-cyan-600">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
