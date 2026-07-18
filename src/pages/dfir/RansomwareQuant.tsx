import { useCallback, useEffect, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, Info, Plus, TrendingUp, AlertTriangle } from 'lucide-react';

interface RansomScenario {
  id: string;
  name: string;
  description: string;
  annual_revenue: number;
  daily_revenue: number;
  estimated_downtime_hours: number;
  recovery_time_hours: number;
  data_volume_gb: number;
  data_recreation_cost: number;
  pii_records: number;
  pii_cost_per_record: number;
  ip_value_at_risk: number;
  ransom_demand: number;
  ransom_currency: string;
  cyber_insurance_coverage: number;
  insurance_deductible: number;
  regulatory_fine_per_record: number;
  notifiable_breach: boolean;
  hourly_incident_response_cost: number;
  ir_hours_estimated: number;
  legal_hours_estimated: number;
  pr_hours_estimated: number;
  downtime_cost: number;
  data_loss_cost: number;
  ransom_paid: number;
  ir_cost: number;
  legal_cost: number;
  pr_cost: number;
  regulatory_fines: number;
  insurance_recovery: number;
  total_impact: number;
  total_impact_after_insurance: number;
}

interface RansomStats {
  total_scenarios: number;
  total_at_risk: number;
  total_after_insurance: number;
  avg_downtime_hours: number;
  worst_scenario: { id: string; name: string; total_impact: number } | null;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

const defaultForm = {
  name: '',
  description: '',
  annual_revenue: 5000000,
  daily_revenue: 13700,
  estimated_downtime_hours: 72,
  recovery_time_hours: 48,
  data_volume_gb: 500,
  data_recreation_cost: 50000,
  pii_records: 10000,
  pii_cost_per_record: 150,
  ip_value_at_risk: 200000,
  ransom_demand: 500000,
  ransom_currency: 'USD',
  cyber_insurance_coverage: 1000000,
  insurance_deductible: 50000,
  regulatory_fine_per_record: 50,
  notifiable_breach: true,
  hourly_incident_response_cost: 350,
  ir_hours_estimated: 80,
  legal_hours_estimated: 40,
  pr_hours_estimated: 20,
};

export default function RansomwareQuant(): JSX.Element {
  const [scenarios, setScenarios] = useState<RansomScenario[]>([]);
  const [stats, setStats] = useState<RansomStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, statsRes] = await Promise.all([fetch('/api/v1/ransomware'), fetch('/api/v1/ransomware/stats')]);
      if (!listRes.ok || !statsRes.ok) throw new Error('Failed to load');
      setScenarios((await listRes.json()).items ?? []);
      setStats((await statsRes.json()) as RansomStats);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = { ...defaultForm };
    for (const [key, val] of fd.entries()) {
      const v = val as string;
      if (key === 'notifiable_breach') {
        (body as Record<string, unknown>)[key] = v === 'true';
        continue;
      }
      const num = parseFloat(v);
      if (!isNaN(num)) (body as Record<string, unknown>)[key] = num;
      else (body as Record<string, unknown>)[key] = v;
    }
    const r = await fetch('/api/v1/ransomware', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setShowCreate(false);
      void fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this scenario?')) return;
    await fetch(`/api/v1/ransomware/${id}`, { method: 'DELETE' });
    if (selectedId === id) setSelectedId(null);
    void fetchData();
  };

  const selected = scenarios.find((s) => s.id === selectedId);

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Shield size={28} />}
      title="Ransomware $ Quantification"
      description="Estimate financial impact of ransomware scenarios — downtime, data loss, ransom, IR, legal, PR, regulatory fines, and insurance recovery."
      loading={loading}
      error={error}
      onRetry={fetchData}
      maxWidthClass="max-w-6xl"
    >
      {stats && (
        <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Scenarios</div>
            <div className="text-xl font-bold font-mono mt-1">{stats.total_scenarios}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Total at Risk</div>
            <div className="text-xl font-bold font-mono mt-1 text-rose-600 dark:text-rose-400">
              {fmt(stats.total_at_risk)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">After Insurance</div>
            <div className="text-xl font-bold font-mono mt-1 text-amber-600 dark:text-amber-400">
              {fmt(stats.total_after_insurance)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Avg Downtime</div>
            <div className="text-xl font-bold font-mono mt-1">{stats.avg_downtime_hours}h</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setShowCreate(!showCreate)}
          className="text-xs font-mono px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Plus size={11} /> New Scenario
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="mb-5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-4 space-y-3"
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <input
              name="name"
              placeholder="Scenario name *"
              required
              className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] col-span-2 sm:col-span-3"
            />
            <label className="text-[10px] font-mono text-slate-500 col-span-2 sm:col-span-3">
              <input name="notifiable_breach" type="checkbox" defaultChecked className="mr-1" /> Notifiable breach (adds
              regulatory fines)
            </label>
            <div className="col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="text-[9px] font-mono text-slate-400">Annual Revenue</label>
                <input
                  name="annual_revenue"
                  type="number"
                  defaultValue={defaultForm.annual_revenue}
                  className="text-[10px] font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] w-full"
                />
              </div>
              <div>
                <label className="text-[9px] font-mono text-slate-400">Ransom Demand</label>
                <input
                  name="ransom_demand"
                  type="number"
                  defaultValue={defaultForm.ransom_demand}
                  className="text-[10px] font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] w-full"
                />
              </div>
              <div>
                <label className="text-[9px] font-mono text-slate-400">PII Records</label>
                <input
                  name="pii_records"
                  type="number"
                  defaultValue={defaultForm.pii_records}
                  className="text-[10px] font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] w-full"
                />
              </div>
              <div>
                <label className="text-[9px] font-mono text-slate-400">Insurance Coverage</label>
                <input
                  name="cyber_insurance_coverage"
                  type="number"
                  defaultValue={defaultForm.cyber_insurance_coverage}
                  className="text-[10px] font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] w-full"
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-xs font-mono px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              Calculate
            </button>
          </div>
        </form>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="space-y-2">
          {scenarios.length === 0 && !loading && (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <Info size={24} className="mx-auto mb-2 opacity-50" />
              <p className="font-mono text-sm">Add a scenario to quantify impact.</p>
            </div>
          )}
          {scenarios.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(selectedId === s.id ? null : s.id)}
              className={`w-full text-left rounded-xl border p-3 transition-colors ${selectedId === s.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/20' : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:border-brand-300'}`}
            >
              <div className="font-mono text-xs font-semibold truncate">{s.name}</div>
              <div className="flex items-center justify-between mt-1">
                <span
                  className={`text-xs font-mono font-bold ${s.total_impact >= 2_000_000 ? 'text-rose-600 dark:text-rose-400' : s.total_impact >= 500_000 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  {fmt(s.total_impact)}
                </span>
                <span className="text-[10px] text-slate-400">{s.estimated_downtime_hours}h downtime</span>
              </div>
              <div className="mt-1 w-full h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.min(100, (s.insurance_recovery / Math.max(s.total_impact, 1)) * 100)}%` }}
                />
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-2">
          {!selected && (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <TrendingUp size={24} className="mx-auto mb-2 opacity-50" />
              <p className="font-mono text-sm">Select a scenario to see the breakdown.</p>
            </div>
          )}

          {selected && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-mono font-semibold text-sm">{selected.name}</h3>
                  <p className="text-micro text-slate-500 mt-0.5">{selected.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(selected.id)}
                  className="text-[10px] text-slate-400 hover:text-rose-500 p-1"
                >
                  <AlertTriangle size={14} />
                </button>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-2.5">
                  <div className="text-[9px] font-mono text-slate-400">Total Impact</div>
                  <div className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400">
                    {fmt(selected.total_impact)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-2.5">
                  <div className="text-[9px] font-mono text-slate-400">After Insurance</div>
                  <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {fmt(selected.total_impact_after_insurance)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-2.5">
                  <div className="text-[9px] font-mono text-slate-400">Insurance Recovers</div>
                  <div className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400">
                    {fmt(selected.insurance_recovery)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-2.5">
                  <div className="text-[9px] font-mono text-slate-400">Total Downtime</div>
                  <div className="text-sm font-bold font-mono">
                    {selected.estimated_downtime_hours + selected.recovery_time_hours}h
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3 space-y-2">
                <h4 className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  Cost Breakdown
                </h4>
                {[
                  {
                    label: 'Downtime',
                    value: selected.downtime_cost,
                    pct: (selected.downtime_cost / selected.total_impact) * 100,
                  },
                  {
                    label: 'Data Loss',
                    value: selected.data_loss_cost,
                    pct: (selected.data_loss_cost / selected.total_impact) * 100,
                  },
                  {
                    label: 'Ransom Demand',
                    value: selected.ransom_paid,
                    pct: (selected.ransom_paid / selected.total_impact) * 100,
                  },
                  {
                    label: 'Incident Response',
                    value: selected.ir_cost,
                    pct: (selected.ir_cost / selected.total_impact) * 100,
                  },
                  {
                    label: 'Legal',
                    value: selected.legal_cost,
                    pct: (selected.legal_cost / selected.total_impact) * 100,
                  },
                  {
                    label: 'PR / Comms',
                    value: selected.pr_cost,
                    pct: (selected.pr_cost / selected.total_impact) * 100,
                  },
                  {
                    label: 'Regulatory Fines',
                    value: selected.regulatory_fines,
                    pct: (selected.regulatory_fines / selected.total_impact) * 100,
                  },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-[10px] font-mono w-28 text-slate-500 shrink-0">{item.label}</span>
                    <div className="flex-1 h-3 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full rounded bg-brand-500" style={{ width: `${Math.min(item.pct, 100)}%` }} />
                    </div>
                    <span className="text-[10px] font-mono w-20 text-right text-slate-600 dark:text-slate-400 shrink-0">
                      {fmt(item.value)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-3 pt-1 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                  <span className="text-[10px] font-mono w-28 font-bold shrink-0">Insurance</span>
                  <div className="flex-1" />
                  <span className="text-[10px] font-mono w-20 text-right text-emerald-600 dark:text-emerald-400 shrink-0">
                    -{fmt(selected.insurance_recovery)}
                  </span>
                </div>
              </div>

              {/* Parameters */}
              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
                <h4 className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  Parameters
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] font-mono">
                  <div>
                    <span className="text-slate-400">Revenue/yr:</span> {fmt(selected.annual_revenue)}
                  </div>
                  <div>
                    <span className="text-slate-400">Ransom:</span> {fmt(selected.ransom_demand)}
                  </div>
                  <div>
                    <span className="text-slate-400">PII records:</span> {selected.pii_records.toLocaleString()}
                  </div>
                  <div>
                    <span className="text-slate-400">Insurance:</span> {fmt(selected.cyber_insurance_coverage)}
                  </div>
                  <div>
                    <span className="text-slate-400">Deductible:</span> {fmt(selected.insurance_deductible)}
                  </div>
                  <div>
                    <span className="text-slate-400">IR cost/hr:</span> {fmt(selected.hourly_incident_response_cost)}
                  </div>
                  <div>
                    <span className="text-slate-400">Data volume:</span> {selected.data_volume_gb} GB
                  </div>
                  <div>
                    <span className="text-slate-400">IP at risk:</span> {fmt(selected.ip_value_at_risk)}
                  </div>
                  <div>
                    <span className="text-slate-400">Fine/record:</span> {fmt(selected.regulatory_fine_per_record)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DataPageLayout>
  );
}
