import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ShieldAlert, Info, Loader2, RefreshCw, Plus, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
type RiskStatus = 'identified' | 'assessed' | 'treatment' | 'monitoring' | 'accepted' | 'closed';
type TreatmentStrategy = 'mitigate' | 'transfer' | 'accept' | 'avoid';

interface FairQuantification {
  sle_min: number;
  sle_most_likely: number;
  sle_max: number;
  annual_occurrences: number;
  ale_min: number;
  ale_most_likely: number;
  ale_max: number;
  currency: string;
}

interface RiskRegisterEntry {
  id: string;
  title: string;
  description: string;
  category: string;
  asset_ids: string[];
  inherent_level: RiskLevel;
  current_level: RiskLevel;
  residual_level: RiskLevel;
  status: RiskStatus;
  treatment_strategy?: TreatmentStrategy;
  treatment_plan?: string;
  treatment_owner?: string;
  treatment_due?: string;
  fair?: FairQuantification;
  priority_score: number;
  created_at: string;
  updated_at: string;
  accepted_until?: string;
  accepted_justification?: string;
}

interface RiskRegisterStats {
  total: number;
  open_risks: number;
  total_ale: number;
  currency: string;
  by_level: Record<string, number>;
  by_status: Record<string, number>;
  by_category: Record<string, number>;
}

interface RiskListResponse {
  count: number;
  entries: RiskRegisterEntry[];
}

const RISK_COLORS: Record<RiskLevel, { text: string; chip: string; bar: string }> = {
  none: { text: 'text-slate-500', chip: 'border-slate-300 bg-slate-100 text-slate-600', bar: 'bg-slate-300' },
  low: {
    text: 'text-sky-700 dark:text-sky-300',
    chip: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    bar: 'bg-sky-500',
  },
  medium: {
    text: 'text-amber-700 dark:text-amber-300',
    chip: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    bar: 'bg-amber-500',
  },
  high: {
    text: 'text-orange-700 dark:text-orange-300',
    chip: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300',
    bar: 'bg-orange-500',
  },
  critical: {
    text: 'text-rose-700 dark:text-rose-300',
    chip: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
  },
};

const STATUS_TONES: Record<RiskStatus, string> = {
  identified: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  assessed: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  treatment: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  monitoring: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
  accepted: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  closed: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
};

const CATEGORIES = [
  'general',
  'technology',
  'compliance',
  'operational',
  'financial',
  'reputational',
  'strategic',
  'third-party',
];

export default function RiskRegister(): JSX.Element {
  const [entries, setEntries] = useState<RiskRegisterEntry[]>([]);
  const [stats, setStats] = useState<RiskRegisterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'general' as string,
    inherent_level: 'medium' as RiskLevel,
    current_level: 'medium' as RiskLevel,
    residual_level: 'medium' as RiskLevel,
    status: 'identified' as RiskStatus,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch(
          `/api/v1/risk-register?${new URLSearchParams({ ...(statusFilter ? { status: statusFilter } : {}), ...(catFilter ? { category: catFilter } : {}) }).toString()}`
        ),
        fetch('/api/v1/risk-register/stats'),
      ]);
      if (!listRes.ok) throw new Error(`list HTTP ${listRes.status}`);
      if (!statsRes.ok) throw new Error(`stats HTTP ${statsRes.status}`);
      const listData = (await listRes.json()) as RiskListResponse;
      const statsData = (await statsRes.json()) as RiskRegisterStats;
      setEntries(listData.entries);
      setStats(statsData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, catFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleCreate = async () => {
    try {
      const r = await fetch('/api/v1/risk-register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error(`create HTTP ${r.status}`);
      setShowForm(false);
      setForm({
        title: '',
        description: '',
        category: 'general',
        inherent_level: 'medium',
        current_level: 'medium',
        residual_level: 'medium',
        status: 'identified',
      });
      void fetchData();
    } catch (e) {
      console.error('create failed:', e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const r = await fetch(`/api/v1/risk-register/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`delete HTTP ${r.status}`);
      void fetchData();
    } catch (e) {
      console.error('delete failed:', e instanceof Error ? e.message : String(e));
    }
  };

  const handleUpdateStatus = async (id: string, status: RiskStatus) => {
    try {
      const r = await fetch(`/api/v1/risk-register/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error(`update HTTP ${r.status}`);
      void fetchData();
    } catch (e) {
      console.error('update failed:', e instanceof Error ? e.message : String(e));
    }
  };

  const summary = useMemo(() => {
    const high = entries.filter((e) => e.residual_level === 'high' || e.residual_level === 'critical');
    const untreated = entries.filter(
      (e) =>
        e.residual_level === 'high' ||
        (e.residual_level === 'critical' && e.status !== 'accepted' && e.status !== 'closed')
    );
    return { high: high.length, untreated: untreated.length };
  }, [entries]);

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<ShieldAlert size={28} />}
      title="Risk Register"
      description={`Governance view over the risk register: inherent → current → residual levels, treatment plans, and CRQ/FAIR quantification. ${stats ? `${stats.total} risks (${stats.open_risks} open).` : ''}`}
      loading={loading}
      error={error}
      onRetry={fetchData}
      maxWidthClass="max-w-6xl"
    >
      {/* Stats bar */}
      {stats && (
        <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Total Risks</div>
            <div className="text-xl font-bold font-mono mt-1">{stats.total}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Open</div>
            <div className="text-xl font-bold font-mono mt-1 text-amber-600 dark:text-amber-400">
              {stats.open_risks}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">High / Critical</div>
            <div className="text-xl font-bold font-mono mt-1 text-rose-600 dark:text-rose-400">{summary.high}</div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3">
            <div className="text-micro font-mono text-slate-500">Total ALE</div>
            <div className="text-xl font-bold font-mono mt-1 text-emerald-600 dark:text-emerald-400">
              {stats.total_ale > 0
                ? `${stats.currency === 'USD' ? '$' : stats.currency}${stats.total_ale.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : 'N/A'}
            </div>
          </div>
        </div>
      )}

      {/* Filters + actions */}
      <div className="mb-5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
            aria-label="Filter by status"
          >
            <option value="">Any status</option>
            <option value="identified">Identified</option>
            <option value="assessed">Assessed</option>
            <option value="treatment">In Treatment</option>
            <option value="monitoring">Monitoring</option>
            <option value="accepted">Accepted</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
            aria-label="Filter by category"
          >
            <option value="">Any category</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="ml-auto text-xs font-mono px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 inline-flex items-center gap-1.5"
          >
            <Plus size={12} /> Add Risk
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-micro font-mono text-slate-500 mb-1">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]"
                  placeholder="Risk title"
                />
              </div>
              <div>
                <label className="block text-micro font-mono text-slate-500 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-micro font-mono text-slate-500 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]"
                  rows={2}
                  placeholder="Risk description"
                />
              </div>
              <div>
                <label className="block text-micro font-mono text-slate-500 mb-1">Inherent Level</label>
                <select
                  value={form.inherent_level}
                  onChange={(e) => setForm((f) => ({ ...f, inherent_level: e.target.value as RiskLevel }))}
                  className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]"
                >
                  {(['low', 'medium', 'high', 'critical'] as RiskLevel[]).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-micro font-mono text-slate-500 mb-1">Current Level</label>
                <select
                  value={form.current_level}
                  onChange={(e) => setForm((f) => ({ ...f, current_level: e.target.value as RiskLevel }))}
                  className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]"
                >
                  {(['low', 'medium', 'high', 'critical'] as RiskLevel[]).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-micro font-mono text-slate-500 mb-1">Residual Level</label>
                <select
                  value={form.residual_level}
                  onChange={(e) => setForm((f) => ({ ...f, residual_level: e.target.value as RiskLevel }))}
                  className="w-full px-2 py-1.5 text-xs font-mono rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]"
                >
                  {(['low', 'medium', 'high', 'critical'] as RiskLevel[]).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!form.title}
                className="text-xs font-mono px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-xs font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Risk list */}
      <div className="space-y-2">
        {entries.map((entry) => {
          const isOpen = expanded.has(entry.id);
          const residualStyle = RISK_COLORS[entry.residual_level];
          const statusTone = STATUS_TONES[entry.status];
          return (
            <div
              key={entry.id}
              className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleExpand(entry.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
              >
                {/* Priority score */}
                <div className="flex flex-col items-center shrink-0 w-10">
                  <span
                    className={`text-sm font-bold font-mono leading-none ${entry.priority_score >= 70 ? 'text-rose-600' : entry.priority_score >= 40 ? 'text-amber-600' : 'text-slate-500'}`}
                  >
                    {entry.priority_score}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 uppercase mt-0.5">priority</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {entry.title}
                    </span>
                    <span
                      className={`text-micro font-mono px-1.5 py-0.5 rounded border ${residualStyle.chip} shrink-0`}
                    >
                      {entry.residual_level}
                    </span>
                    <span className={`text-micro font-mono px-1.5 py-0.5 rounded ${statusTone} shrink-0`}>
                      {entry.status}
                    </span>
                    <span className="text-micro font-mono text-slate-400 shrink-0">{entry.category}</span>
                  </div>
                  <div className="flex items-center gap-3 text-micro text-slate-500 mt-0.5">
                    <span>inherent: {entry.inherent_level}</span>
                    <span>current: {entry.current_level}</span>
                    <span>residual: {entry.residual_level}</span>
                    {entry.treatment_strategy && <span>treatment: {entry.treatment_strategy}</span>}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(entry.id);
                  }}
                  className="text-slate-400 hover:text-rose-500 transition-colors shrink-0"
                  title="Delete risk"
                >
                  <Trash2 size={12} />
                </button>
                {isOpen ? (
                  <ChevronDown size={14} className="text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight size={14} className="text-slate-400 shrink-0" />
                )}
              </button>

              {isOpen && (
                <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] px-4 py-3 space-y-3 bg-slate-50/50 dark:bg-[rgb(var(--surface-100))]/50">
                  {/* Description */}
                  {entry.description && (
                    <p className="text-meta font-mono text-slate-600 dark:text-slate-400 leading-relaxed">
                      {entry.description}
                    </p>
                  )}

                  {/* Risk level bars */}
                  <div className="space-y-1.5">
                    {(['inherent', 'current', 'residual'] as const).map((level) => {
                      const val = entry[`${level}_level`] as RiskLevel;
                      const pct = RISK_COLORS[val]
                        ? (['none', 'low', 'medium', 'high', 'critical'].indexOf(val) / 4) * 100
                        : 0;
                      const color = RISK_COLORS[val]?.bar ?? 'bg-slate-300';
                      return (
                        <div key={level} className="flex items-center gap-2">
                          <span className="text-micro font-mono text-slate-500 w-16 shrink-0 capitalize">{level}</span>
                          <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                            <div
                              className={`h-full rounded-full ${color} transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-micro font-mono w-14 text-right ${RISK_COLORS[val]?.text ?? ''}`}>
                            {val}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Treatment */}
                  {entry.treatment_strategy && (
                    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-2.5">
                      <div className="text-micro font-mono text-slate-500 mb-1">
                        Treatment: {entry.treatment_strategy}
                        {entry.treatment_owner && ` · Owner: ${entry.treatment_owner}`}
                        {entry.treatment_due && ` · Due: ${entry.treatment_due.slice(0, 10)}`}
                      </div>
                      {entry.treatment_plan && (
                        <p className="text-meta font-mono text-slate-600 dark:text-slate-400">{entry.treatment_plan}</p>
                      )}
                    </div>
                  )}

                  {/* FAIR Quantification */}
                  {entry.fair && (
                    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-2.5">
                      <div className="text-micro font-mono text-slate-500 mb-1">FAIR Quantification</div>
                      <div className="grid grid-cols-3 gap-2 text-micro font-mono">
                        <div>
                          <span className="text-slate-400">SLE:</span>{' '}
                          {entry.fair.currency === 'USD' ? '$' : entry.fair.currency}
                          {entry.fair.sle_most_likely.toLocaleString()}
                        </div>
                        <div>
                          <span className="text-slate-400">ARO:</span> {entry.fair.annual_occurrences}x/yr
                        </div>
                        <div>
                          <span className="text-slate-400">ALE:</span>{' '}
                          {entry.fair.currency === 'USD' ? '$' : entry.fair.currency}
                          {entry.fair.ale_most_likely.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* <Actions */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['identified', 'assessed', 'treatment', 'monitoring', 'accepted', 'closed'] as RiskStatus[]).map(
                      (s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleUpdateStatus(entry.id, s)}
                          className={`text-micro font-mono px-2 py-0.5 rounded border transition-colors ${
                            entry.status === s
                              ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                              : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-brand-500/40'
                          }`}
                        >
                          {s}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!loading && entries.length === 0 && (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <Info size={24} className="mx-auto mb-2 opacity-50" />
            <p className="font-mono text-sm">No risks found. Add your first risk to start the register.</p>
          </div>
        )}
      </div>
    </DataPageLayout>
  );
}
