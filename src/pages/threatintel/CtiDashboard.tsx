import { useEffect, useState, useCallback } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  RefreshCw,
  Brain,
  Dna,
  BarChart3,
  Newspaper,
  Shield,
  TrendingUp,
  AlertTriangle,
  Zap,
  Target,
} from 'lucide-react';

const API = '/api/v1/cti';

interface IocStats {
  total_iocs: number;
  active_iocs: number;
  type_breakdown: Record<string, number>;
  source_breakdown: Record<string, number>;
  top_malware_families: Array<{ family: string; count: number }>;
  trending: Array<{ value: string; type: string; source: string; observations: number }>;
  recent_news: number;
  news_sources: Record<string, number>;
}

interface Prediction {
  prediction_id: string;
  title: string;
  threat_level: string;
  confidence: number;
  summary: string;
  attack_flow: Array<{ phase: string; technique_id: string; technique: string; description: string }>;
  target_sectors: string[];
  mitre_techniques: string[];
  novel_aspects: string[];
  defensive_recommendations: string[];
  reasoning: string;
  based_on_sources: string[];
}

interface MutationVariant {
  variant_id: string;
  title: string;
  mutation_type: string;
  threat_level: string;
  combined_score: number;
  novelty_score: number;
  summary: string;
  seed_name?: string;
}

type Tab = 'dashboard' | 'predictions' | 'mutations' | 'news';

const TABS: Array<{ id: Tab; label: string; desc: string }> = [
  { id: 'dashboard', label: 'Dashboard', desc: 'IOC collection stats, type breakdown, trending families' },
  { id: 'predictions', label: 'AI Predictions', desc: 'AI-generated attack pattern forecasts' },
  { id: 'mutations', label: 'Attack Mutations', desc: 'Novel attack variant generation from seed patterns' },
  { id: 'news', label: 'Threat News', desc: 'Aggregated security news from 10+ feeds' },
];

const THREAT_PILL: Record<string, string> = {
  CRITICAL: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  HIGH: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  MEDIUM: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  LOW: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

const TYPE_PILL: Record<string, string> = {
  ip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  domain: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  url: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  hash: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  cve: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  email: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
};

export default function CtiDashboard(): JSX.Element {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<IocStats | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [mutations, setMutations] = useState<{
    seeds: Array<Record<string, unknown>>;
    top_variants: MutationVariant[];
    stats: Record<string, number>;
  } | null>(null);
  const [news, setNews] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [mutationInput, setMutationInput] = useState('');
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-blocking failure flag for the on-mount tab fetchers (the page-level
  // `error` would blank the whole dashboard, so those use this instead).
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stats`);
      if (res.ok) setStats(await res.json());
    } catch {
      setLoadError(true);
    }
  }, []);

  const fetchPredictions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/predictions`);
      if (res.ok) {
        const data = await res.json();
        setPredictions(data.predictions || []);
      }
    } catch {
      setLoadError(true);
    }
  }, []);

  const fetchMutations = useCallback(async () => {
    try {
      const res = await fetch(`${API}/mutations`);
      if (res.ok) setMutations(await res.json());
    } catch {
      setLoadError(true);
    }
  }, []);

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch(`${API}/news?limit=30`);
      if (res.ok) {
        const data = await res.json();
        setNews(data.news || []);
      }
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([fetchStats(), fetchPredictions(), fetchMutations(), fetchNews()]).finally(() => setLoading(false));
  }, [fetchStats, fetchPredictions, fetchMutations, fetchNews, reloadKey]);

  const handleCollect = async () => {
    setCollecting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/collect`, { method: 'POST' });
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        await fetchStats();
        await fetchNews();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Collection failed');
    }
    setCollecting(false);
  };

  const handlePredict = async () => {
    setPredicting(true);
    setError(null);
    try {
      const res = await fetch(`${API}/predictions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 3 }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else if (data.predictions) setPredictions(data.predictions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prediction failed');
    }
    setPredicting(false);
  };

  const handleMutate = async () => {
    if (!mutationInput.trim()) return;
    setMutating(true);
    setError(null);
    try {
      const res = await fetch(`${API}/mutate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: mutationInput, count: 5 }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        await fetchMutations();
        setMutationInput('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mutation failed');
    }
    setMutating(false);
  };

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Shield size={28} />}
      title="CTI Fusion & Prediction"
      description="Automated IOC collection from 12 sources, AI-powered attack prediction, and mutation analysis."
      maxWidthClass="max-w-6xl"
      loading={loading}
      error={error}
      onRetry={() => {
        fetchStats();
        fetchPredictions();
        fetchMutations();
        fetchNews();
      }}
      empty={!stats || (stats.total_iocs === 0 && stats.recent_news === 0)}
      emptyMessage="No CTI data yet. Run a collection to populate the database."
      emptyIcon={<Shield size={32} className="text-slate-400" />}
    >
      {loadError && !loading && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-tool text-rose-700 dark:text-rose-300"
        >
          <span>Some dashboard data failed to load.</span>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="shrink-0 rounded border border-rose-400/50 px-2 py-0.5 text-mini font-semibold hover:bg-rose-100/60 dark:hover:bg-rose-900/30"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tab navigation */}
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-6"
        aria-label="CTI panels"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${
              tab === t.id
                ? 'border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
            aria-selected={tab === t.id}
            role="tab"
          >
            {t.label}
          </button>
        ))}
      </nav>

      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
        {TABS.find((t) => t.id === tab)?.desc}
      </p>

      <div role="tabpanel">
        {/* ── Dashboard Tab ──────────────────────────────────────────── */}
        {tab === 'dashboard' && stats && (
          <div className="space-y-6">
            {/* Action bar */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleCollect}
                disabled={collecting}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 text-sm font-mono font-semibold hover:bg-brand-100 dark:hover:bg-brand-900/40 disabled:opacity-50 transition-colors"
              >
                {collecting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                {collecting ? 'Collecting...' : 'Run Collection'}
              </button>
              <button
                onClick={() => {
                  fetchStats();
                  fetchNews();
                }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 text-slate-600 dark:text-slate-400 text-sm font-mono hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-200))] transition-colors"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon={<Target size={16} />}
                label="Total IOCs"
                value={stats.total_iocs}
                accent="text-brand-600 dark:text-brand-400"
              />
              <StatCard
                icon={<TrendingUp size={16} />}
                label="Active (decay&gt;0.5)"
                value={stats.active_iocs}
                accent="text-emerald-600 dark:text-emerald-400"
              />
              <StatCard
                icon={<Newspaper size={16} />}
                label="News Articles"
                value={stats.recent_news}
                accent="text-violet-600 dark:text-violet-400"
              />
              <StatCard
                icon={<AlertTriangle size={16} />}
                label="Malware Families"
                value={stats.top_malware_families.length}
                accent="text-amber-600 dark:text-amber-400"
              />
            </div>

            {/* Type breakdown + Top families */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-5">
                <h3 className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <BarChart3 size={14} /> IOC Type Breakdown
                </h3>
                {Object.entries(stats.type_breakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <div
                      key={type}
                      className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-[rgb(var(--border-400))] last:border-0"
                    >
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${TYPE_PILL[type] || 'border-slate-300 bg-slate-100 text-slate-600 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-300))] dark:text-slate-400'}`}
                      >
                        {type}
                      </span>
                      <span className="text-sm font-mono text-slate-800 dark:text-slate-200">
                        {count.toLocaleString()}
                      </span>
                    </div>
                  ))}
                {Object.keys(stats.type_breakdown).length === 0 && (
                  <p className="text-xs font-mono text-slate-400 dark:text-slate-500">No IOCs collected yet.</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-5">
                <h3 className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} /> Top Malware Families
                </h3>
                {stats.top_malware_families.length === 0 ? (
                  <p className="text-xs font-mono text-slate-400 dark:text-slate-500">
                    No named families yet. Run a collection first.
                  </p>
                ) : (
                  stats.top_malware_families.map((f) => (
                    <div
                      key={f.family}
                      className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-[rgb(var(--border-400))] last:border-0"
                    >
                      <span className="text-sm text-slate-700 dark:text-slate-300">{f.family}</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400">
                        {f.count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Trending */}
            {stats.trending.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-5">
                <h3 className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <TrendingUp size={14} /> Most Observed IOCs (multi-source)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs font-mono text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                        <th className="text-left py-2 font-semibold">Value</th>
                        <th className="text-left py-2 font-semibold">Type</th>
                        <th className="text-left py-2 font-semibold">Source</th>
                        <th className="text-right py-2 font-semibold">Obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.trending.map((t, i) => (
                        <tr
                          key={i}
                          className="border-b border-slate-100 dark:border-[rgb(var(--border-400))] last:border-0"
                        >
                          <td className="py-2 font-mono text-xs text-brand-600 dark:text-brand-400 max-w-xs truncate">
                            {t.value}
                          </td>
                          <td className="py-2">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono border ${TYPE_PILL[t.type] || 'border-slate-300 bg-slate-100 text-slate-600'}`}
                            >
                              {t.type}
                            </span>
                          </td>
                          <td className="py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{t.source}</td>
                          <td className="py-2 text-right font-mono text-xs text-slate-800 dark:text-slate-200">
                            {t.observations}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Predictions Tab ────────────────────────────────────────── */}
        {tab === 'predictions' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <button
                onClick={handlePredict}
                disabled={predicting}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-sm font-mono font-semibold hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-50 transition-colors"
              >
                {predicting ? <RefreshCw size={14} className="animate-spin" /> : <Brain size={14} />}
                {predicting ? 'Generating...' : 'Generate Predictions'}
              </button>
            </div>

            {predictions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-8 text-center">
                <Brain size={32} className="mx-auto text-slate-400 dark:text-slate-500 mb-3" />
                <p className="text-sm font-mono text-slate-500 dark:text-slate-400">
                  No predictions yet. Click "Generate Predictions" to forecast attack patterns.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {predictions.map((p) => (
                  <div
                    key={p.prediction_id}
                    className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          {p.prediction_id}
                        </span>
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5 leading-snug">
                          {p.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border ${THREAT_PILL[p.threat_level] || THREAT_PILL.MEDIUM}`}
                        >
                          {p.threat_level}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          {p.confidence}%
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 leading-relaxed">{p.summary}</p>

                    {p.attack_flow?.length > 0 && (
                      <div className="mb-3">
                        <h4 className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                          ATT&amp;CK Kill Chain
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {p.attack_flow.map((phase, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-300)/0.5)] text-[11px] font-mono text-slate-600 dark:text-slate-400"
                            >
                              <span className="text-brand-600 dark:text-brand-400">{phase.technique_id}</span>
                              <span className="text-slate-400 dark:text-slate-500">→</span>
                              {phase.technique}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 text-[11px] font-mono text-slate-400 dark:text-slate-500">
                      {p.target_sectors?.length > 0 && <span>Targets: {p.target_sectors.join(', ')}</span>}
                      {p.defensive_recommendations?.length > 0 && (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Defenses: {p.defensive_recommendations.slice(0, 2).join('; ')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Mutations Tab ──────────────────────────────────────────── */}
        {tab === 'mutations' && (
          <div className="space-y-4">
            {/* Input */}
            <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-5">
              <h3 className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Dna size={14} /> Seed Attack Input
              </h3>
              <textarea
                value={mutationInput}
                onChange={(e) => setMutationInput(e.target.value)}
                placeholder="Describe an attack pattern, campaign, or malware (e.g. 'LockBit ransomware exploiting CVE-2024-21413 via phishing email to encrypt ESXi servers')"
                className="w-full rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-300)/0.5)] p-3 text-sm font-mono text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 resize-none h-24 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 dark:focus:border-brand-400"
              />
              <button
                onClick={handleMutate}
                disabled={mutating || !mutationInput.trim()}
                className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 text-sm font-mono font-semibold hover:bg-orange-100 dark:hover:bg-orange-900/40 disabled:opacity-50 transition-colors"
              >
                {mutating ? <RefreshCw size={14} className="animate-spin" /> : <Dna size={14} />}
                {mutating ? 'Generating...' : 'Generate Variants'}
              </button>
            </div>

            {/* Stats */}
            {mutations?.stats && (
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  label="Seeds"
                  value={mutations.stats.seeds || 0}
                  accent="text-brand-600 dark:text-brand-400"
                />
                <StatCard
                  label="Variants"
                  value={mutations.stats.variants || 0}
                  accent="text-orange-600 dark:text-orange-400"
                />
                <StatCard
                  label="Avg Score"
                  value={mutations.stats.avg_score || 0}
                  accent="text-emerald-600 dark:text-emerald-400"
                />
              </div>
            )}

            {/* Top variants */}
            {mutations?.top_variants && mutations.top_variants.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Top Mutation Variants
                </h3>
                {mutations.top_variants.map((v) => (
                  <div
                    key={v.variant_id}
                    className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">{v.variant_id}</span>
                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5 leading-snug">
                          {v.title}
                        </h4>
                        {v.seed_name && (
                          <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                            Seed: {v.seed_name}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border ${THREAT_PILL[v.threat_level] || THREAT_PILL.MEDIUM}`}
                        >
                          {v.threat_level}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                          Score: {v.combined_score}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{v.summary}</p>
                    <span className="inline-block mt-2 px-2 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {v.mutation_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── News Tab ───────────────────────────────────────────────── */}
        {tab === 'news' && (
          <div className="space-y-3">
            <div className="flex gap-3">
              <button
                onClick={fetchNews}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 text-slate-600 dark:text-slate-400 text-sm font-mono hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-200))] transition-colors"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            {news.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-8 text-center">
                <Newspaper size={32} className="mx-auto text-slate-400 dark:text-slate-500 mb-3" />
                <p className="text-sm font-mono text-slate-500 dark:text-slate-400">No news articles collected yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {news.map((n, i) => (
                  <a
                    key={i}
                    href={String(n.url || '#')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-4 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1 leading-snug line-clamp-2">
                        {String(n.title)}
                      </h4>
                      <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap flex-shrink-0">
                        {String(n.source)}
                      </span>
                    </div>
                    {n.summary ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                        {String(n.summary)}
                      </p>
                    ) : null}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DataPageLayout>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-4">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className={accent}>{icon}</span>}
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <span className={`text-xl font-bold font-mono ${accent}`}>{value.toLocaleString()}</span>
    </div>
  );
}
