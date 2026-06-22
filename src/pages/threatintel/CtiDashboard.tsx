import { useEffect, useState, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
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

const THREAT_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-500/20 text-red-300 border-red-500/30',
  HIGH: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  MEDIUM: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  LOW: 'bg-green-500/20 text-green-300 border-green-500/30',
};

const TYPE_ICONS: Record<string, string> = {
  ip: '🌐',
  domain: '🔗',
  url: '🔗',
  hash: '🔒',
  cve: '🛡️',
  email: '📧',
};

export default function CtiDashboard() {
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
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stats`);
      if (res.ok) setStats(await res.json());
    } catch {
      /* ignore */
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
      /* ignore */
    }
  }, []);

  const fetchMutations = useCallback(async () => {
    try {
      const res = await fetch(`${API}/mutations`);
      if (res.ok) setMutations(await res.json());
    } catch {
      /* ignore */
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
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchStats(), fetchPredictions(), fetchMutations(), fetchNews()]).finally(() => setLoading(false));
  }, [fetchStats, fetchPredictions, fetchMutations, fetchNews]);

  const handleCollect = async () => {
    setCollecting(true);
    setError('');
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
    setError('');
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
    setError('');
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

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={16} /> },
    { id: 'predictions', label: 'AI Predictions', icon: <Brain size={16} /> },
    { id: 'mutations', label: 'Attack Mutations', icon: <Dna size={16} /> },
    { id: 'news', label: 'Threat News', icon: <Newspaper size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <BackLink to="/threatintel">
          <ArrowLeft size={14} /> Back to Threat Intel
        </BackLink>

        <div className="mt-6 mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Shield className="text-cyan-400" size={32} />
            CTI Fusion & Prediction Platform
          </h1>
          <p className="text-gray-400 mt-2">
            Automated IOC collection, AI-powered attack prediction, and mutation analysis
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-gray-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 transition-colors ${
                tab === t.id ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">{error}</div>
        )}

        {/* Dashboard Tab */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            {/* Action bar */}
            <div className="flex gap-3">
              <button
                onClick={handleCollect}
                disabled={collecting}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
              >
                {collecting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                {collecting ? 'Collecting...' : 'Run Collection'}
              </button>
              <button
                onClick={() => {
                  fetchStats();
                  fetchNews();
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-500">Loading CTI data...</div>
            ) : stats ? (
              <>
                {/* Stat cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard icon={<Target size={20} />} label="Total IOCs" value={stats.total_iocs} color="cyan" />
                  <StatCard
                    icon={<TrendingUp size={20} />}
                    label="Active (decay>0.5)"
                    value={stats.active_iocs}
                    color="green"
                  />
                  <StatCard
                    icon={<Newspaper size={20} />}
                    label="News Articles"
                    value={stats.recent_news}
                    color="purple"
                  />
                  <StatCard
                    icon={<AlertTriangle size={20} />}
                    label="Malware Families"
                    value={stats.top_malware_families.length}
                    color="orange"
                  />
                </div>

                {/* Type breakdown + Top families */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                      <BarChart3 size={16} /> IOC Type Breakdown
                    </h3>
                    {Object.entries(stats.type_breakdown)
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between py-1.5">
                          <span className="text-sm text-gray-400 flex items-center gap-2">
                            <span>{TYPE_ICONS[type] || '📊'}</span> {type}
                          </span>
                          <span className="text-sm font-mono text-white">{count.toLocaleString()}</span>
                        </div>
                      ))}
                  </div>

                  <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                      <AlertTriangle size={16} /> Top Malware Families
                    </h3>
                    {stats.top_malware_families.length === 0 ? (
                      <p className="text-sm text-gray-500">No named families yet. Run a collection first.</p>
                    ) : (
                      stats.top_malware_families.map((f) => (
                        <div key={f.family} className="flex items-center justify-between py-1.5">
                          <span className="text-sm text-gray-300">{f.family}</span>
                          <span className="text-xs bg-gray-700 px-2 py-0.5 rounded-full text-gray-300">{f.count}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Trending */}
                {stats.trending.length > 0 && (
                  <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                      <TrendingUp size={16} /> Most Observed IOCs (multi-source)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 border-b border-gray-700">
                            <th className="text-left py-2">Value</th>
                            <th className="text-left py-2">Type</th>
                            <th className="text-left py-2">Source</th>
                            <th className="text-right py-2">Observations</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.trending.map((t, i) => (
                            <tr key={i} className="border-b border-gray-700/50">
                              <td className="py-2 font-mono text-xs text-cyan-300 max-w-xs truncate">{t.value}</td>
                              <td className="py-2 text-gray-400">{t.type}</td>
                              <td className="py-2 text-gray-400">{t.source}</td>
                              <td className="py-2 text-right text-white font-mono">{t.observations}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                No data yet. Click "Run Collection" to fetch IOCs from threat feeds.
              </div>
            )}
          </div>
        )}

        {/* Predictions Tab */}
        {tab === 'predictions' && (
          <div className="space-y-6">
            <div className="flex gap-3">
              <button
                onClick={handlePredict}
                disabled={predicting}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
              >
                {predicting ? <RefreshCw size={14} className="animate-spin" /> : <Brain size={14} />}
                {predicting ? 'Generating...' : 'Generate Predictions'}
              </button>
            </div>

            {predictions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No predictions yet. Click "Generate Predictions" to forecast attack patterns.
              </div>
            ) : (
              <div className="space-y-4">
                {predictions.map((p) => (
                  <div key={p.prediction_id} className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="text-xs font-mono text-gray-500">{p.prediction_id}</span>
                        <h3 className="text-lg font-semibold text-white mt-1">{p.title}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded border ${THREAT_COLORS[p.threat_level] || THREAT_COLORS.MEDIUM}`}
                        >
                          {p.threat_level}
                        </span>
                        <span className="text-xs text-gray-400">{p.confidence}% confidence</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-300 mb-3">{p.summary}</p>

                    {/* Kill chain */}
                    {p.attack_flow?.length > 0 && (
                      <div className="mb-3">
                        <h4 className="text-xs font-semibold text-gray-400 mb-2">ATT&CK Kill Chain</h4>
                        <div className="flex flex-wrap gap-2">
                          {p.attack_flow.map((phase, i) => (
                            <span key={i} className="px-2 py-1 bg-gray-700/50 rounded text-xs text-gray-300">
                              <span className="text-cyan-400 font-mono">{phase.technique_id}</span> {phase.technique}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sectors + recommendations */}
                    <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                      {p.target_sectors?.length > 0 && <span>Targets: {p.target_sectors.join(', ')}</span>}
                      {p.defensive_recommendations?.length > 0 && (
                        <span className="text-green-400">
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

        {/* Mutations Tab */}
        {tab === 'mutations' && (
          <div className="space-y-6">
            {/* Input */}
            <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <Dna size={16} /> Seed Attack Input
              </h3>
              <textarea
                value={mutationInput}
                onChange={(e) => setMutationInput(e.target.value)}
                placeholder="Describe an attack pattern, campaign, or malware (e.g. 'LockBit ransomware exploiting CVE-2024-21413 via phishing email to encrypt ESXi servers')"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none h-24"
              />
              <button
                onClick={handleMutate}
                disabled={mutating || !mutationInput.trim()}
                className="mt-3 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
              >
                {mutating ? <RefreshCw size={14} className="animate-spin" /> : <Dna size={14} />}
                {mutating ? 'Generating Variants...' : 'Generate Mutation Variants'}
              </button>
            </div>

            {/* Stats */}
            {mutations?.stats && (
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="Seeds" value={mutations.stats.seeds || 0} color="cyan" />
                <StatCard label="Variants" value={mutations.stats.variants || 0} color="orange" />
                <StatCard label="Avg Score" value={mutations.stats.avg_score || 0} color="green" />
              </div>
            )}

            {/* Top variants */}
            {mutations?.top_variants && mutations.top_variants.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-300">Top Mutation Variants</h3>
                {mutations.top_variants.map((v) => (
                  <div key={v.variant_id} className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-mono text-gray-500">{v.variant_id}</span>
                        <h4 className="text-sm font-semibold text-white mt-1">{v.title}</h4>
                        {v.seed_name && <p className="text-xs text-gray-500 mt-0.5">Seed: {v.seed_name}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded border ${THREAT_COLORS[v.threat_level] || THREAT_COLORS.MEDIUM}`}
                        >
                          {v.threat_level}
                        </span>
                        <span className="text-xs text-gray-400">Score: {v.combined_score}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">{v.summary}</p>
                    <span className="inline-block mt-2 px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300">
                      {v.mutation_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* News Tab */}
        {tab === 'news' && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <button
                onClick={fetchNews}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <RefreshCw size={14} /> Refresh News
              </button>
            </div>

            {news.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No news articles collected yet.</div>
            ) : (
              <div className="space-y-3">
                {news.map((n, i) => (
                  <a
                    key={i}
                    href={String(n.url || '#')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 hover:border-gray-600 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <h4 className="text-sm font-medium text-white flex-1 mr-4">{String(n.title)}</h4>
                      <span className="text-xs text-gray-500 whitespace-nowrap">{String(n.source)}</span>
                    </div>
                    {n.summary ? (
                      <p className="text-xs text-gray-400 mt-1.5 line-clamp-2">{String(n.summary)}</p>
                    ) : null}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    cyan: 'text-cyan-400',
    green: 'text-green-400',
    orange: 'text-orange-400',
    purple: 'text-purple-400',
  };
  return (
    <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className={colorMap[color] || 'text-gray-400'}>{icon}</span>}
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <span className={`text-2xl font-bold ${colorMap[color] || 'text-white'}`}>{value.toLocaleString()}</span>
    </div>
  );
}
