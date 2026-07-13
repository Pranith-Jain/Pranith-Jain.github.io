import { useCallback, useEffect, useState, useRef } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  RefreshCw,
  Server,
  Shield,
  Skull,
  Wifi,
} from 'lucide-react';

/**
 * AI Honeypot Observatory — LLM/AI endpoint honeypot intelligence.
 *
 * Pulls full JSON IOC feed from ai-honeypots.com (CC0 1.0 licensed) and displays
 * attacker categories, TTPs, behavioral metadata, and confidence scoring.
 */

const PROXY_URL = '/api/v1/ai-honeypot-feed';
const DASHBOARD_URL = 'https://ai-honeypots.com';

interface HoneypotIndicator {
  ioc_type: string;
  value: string;
  tlp: string;
  confidence: string;
  actor_category: string;
  ttps: string[];
  first_seen: string;
  last_seen: string;
  total_hits: number;
  distinct_personas: number;
  distinct_paths: number;
  prompt_count: number;
  user_agents: string[];
  models_requested: string[];
  interesting_paths: string[];
  sample_prompts: string[];
  details: string;
  source: string;
}

interface FeedData {
  feed_id: string;
  feed_name: string;
  description: string;
  published: string;
  window_days: number;
  tlp: string;
  license: string;
  taxonomy: {
    actor_categories: Record<string, string>;
    confidence_levels: Record<string, string>;
  };
  summary: {
    total_iocs: number;
    by_category: Record<string, number>;
  };
  indicators: HoneypotIndicator[];
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: typeof Shield; description: string }> = {
  'SCANNER-MASS': {
    label: 'Mass Scanner',
    color: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
    icon: AlertTriangle,
    description: 'High-volume single-purpose endpoint scanners; no prompt interaction',
  },
  'SCANNER-ENUM': {
    label: 'Scanner (Enum)',
    color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    icon: Wifi,
    description: 'Multi-persona enumerators systematically mapping AI service surfaces',
  },
  'SCANNER-COORDINATED': {
    label: 'Coordinated Scan',
    color: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
    icon: Globe,
    description: 'Multi-IP clusters operating as a single coordinated scan campaign',
  },
  'MCP-SCANNER': {
    label: 'MCP Scanner',
    color: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
    icon: Server,
    description: 'Dedicated Model Context Protocol endpoint probers',
  },
  'RELAY-OPERATOR': {
    label: 'Relay Operator',
    color: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
    icon: Skull,
    description: 'Shadow API backend pool managers; clockwork rotation, no prompts',
  },
  'RELAY-VERIFIER': {
    label: 'Relay Verifier',
    color: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
    icon: Globe,
    description: 'Automated relay health-check systems using canned test prompts',
  },
  'RELAY-CUSTOMER': {
    label: 'Relay Customer',
    color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    icon: Shield,
    description: 'End-users of relay pools; uses relay-specific model aliases',
  },
  'RELAY-CATALOGER': {
    label: 'Relay Cataloger',
    color: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20',
    icon: Globe,
    description: 'Model×persona matrix sweepers building backend capability inventories',
  },
  'IDENTITY-PROBER': {
    label: 'Identity Prober',
    color: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20',
    icon: Bot,
    description: 'Prompt-engineering attacks to extract true model identity',
  },
  'CREDENTIAL-HARVESTER': {
    label: 'Credential Harvester',
    color: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
    icon: Skull,
    description: 'Targets .env, API keys, config files; no AI interaction',
  },
  'INFRA-COLLISION': {
    label: 'Infra Collision',
    color: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20',
    icon: Globe,
    description: 'Legitimate infrastructure accidentally hitting AI endpoints',
  },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  'very-high': 'bg-red-500/20 text-red-700 dark:text-red-400',
  high: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
  medium: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  low: 'bg-slate-500/20 text-slate-700 dark:text-slate-400',
};

function formatHits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - Date.parse(dateStr);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AiHoneypotObservatory(): JSX.Element {
  const [feed, setFeed] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIp, setExpandedIp] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchFeed = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const signal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]);
      const res = await fetch(PROXY_URL, { signal });
      if (!res.ok) throw new Error(`Feed returned ${res.status}`);
      const data = (await res.json()) as FeedData;
      if (ctrl.signal.aborted) return;
      setFeed(data);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e instanceof Error ? e.message : 'Failed to load feed');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    return () => abortRef.current?.abort();
  }, [fetchFeed, refreshKey]);

  const indicators = feed?.indicators ?? [];
  const summary = feed?.summary;

  const filtered = indicators.filter((e) => {
    if (categoryFilter && e.actor_category !== categoryFilter) return false;
    if (confidenceFilter && e.confidence !== confidenceFilter) return false;
    if (
      searchQuery &&
      !e.value.includes(searchQuery) &&
      !e.actor_category.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;
    return true;
  });

  const totalHits = indicators.reduce((s, e) => s + e.total_hits, 0);

  return (
    <DataPageLayout
      backTo="/threatintel/infra"
      title="AI Honeypot Observatory"
      description="LLM/AI endpoint honeypot intelligence — attacker categories, TTPs, behavioral metadata from ai-honeypots.com (CC0 1.0)"
      icon={<Bot size={28} />}
    >
      {/* Header stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="Attacker IPs"
          value={summary?.total_iocs ?? indicators.length}
          color="text-slate-900 dark:text-white"
        />
        <StatCard label="Total Hits" value={totalHits} color="text-red-700 dark:text-red-400" />
        <StatCard
          label="Categories"
          value={Object.keys(summary?.by_category ?? {}).length}
          color="text-blue-700 dark:text-blue-400"
        />
        <StatCard
          label="Window"
          value={0}
          displayValue={`${feed?.window_days ?? 7} days`}
          color="text-emerald-700 dark:text-emerald-400"
        />
      </div>

      {/* Source info + actions */}
      <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white/50 dark:bg-[rgb(var(--surface-200))]">
        <Shield className="w-4 h-4 text-slate-600 dark:text-slate-500" />
        <span className="text-xs text-slate-600 dark:text-slate-400">
          Source:{' '}
          <a
            href={DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            ai-honeypots.com
          </a>
          {feed?.published && (
            <span className="ml-2 text-slate-500 dark:text-slate-500">Published {relativeTime(feed.published)}</span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={`${DASHBOARD_URL}/feeds/iocs.json`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> JSON Feed
          </a>
          <a
            href={`${DASHBOARD_URL}/feeds/stix.json`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> STIX 2.1
          </a>
          <a
            href={`${DASHBOARD_URL}/feeds/misp/manifest.json`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> MISP
          </a>
          <a
            href={DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Dashboard
          </a>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 dark:text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="text-center py-8 text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Category breakdown */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          {Object.entries(summary.by_category)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => {
              const cfg = CATEGORY_CONFIG[cat];
              const Icon = cfg?.icon ?? Shield;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    categoryFilter === cat
                      ? 'border-blue-500/50 bg-blue-500/10'
                      : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:border-slate-300 dark:hover:border-[rgb(var(--border-500))]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {cfg?.label ?? cat}
                    </span>
                  </div>
                  <div className="text-lg font-bold text-slate-900 dark:text-white">{count}</div>
                </button>
              );
            })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search IP or category..."
          className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-slate-900 dark:text-white w-48"
        />
        <select
          value={confidenceFilter}
          onChange={(e) => setConfidenceFilter(e.target.value)}
          className="px-2 py-1.5 text-xs rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-slate-700 dark:text-slate-300"
        >
          <option value="">All Confidence</option>
          <option value="very-high">Very High</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        {(categoryFilter || confidenceFilter || searchQuery) && (
          <button
            onClick={() => {
              setCategoryFilter('');
              setConfidenceFilter('');
              setSearchQuery('');
            }}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-500">
          {filtered.length} / {indicators.length} IPs
        </span>
      </div>

      {/* IP table */}
      <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-400">IP</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-400">Category</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-400">Confidence</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-400">Hits</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-400">TTPs</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600 dark:text-slate-400" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500 dark:text-slate-500">
                    Loading IOC feed...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500 dark:text-slate-500">
                    No entries match your filters.
                  </td>
                </tr>
              )}
              {filtered.map((entry) => {
                const cfg = CATEGORY_CONFIG[entry.actor_category];
                const isExpanded = expandedIp === entry.value;
                return (
                  <>
                    <tr
                      key={entry.value}
                      className="border-b border-slate-100 dark:border-[rgb(var(--border-400))] last:border-0 hover:bg-slate-50 dark:hover:bg-[rgb(var(--hover-100))] cursor-pointer"
                      onClick={() => setExpandedIp(isExpanded ? null : entry.value)}
                    >
                      <td className="px-3 py-2 font-mono text-slate-800 dark:text-slate-200">{entry.value}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${cfg?.color ?? 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20'}`}
                        >
                          {cfg?.label ?? entry.actor_category}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${CONFIDENCE_COLORS[entry.confidence] ?? 'bg-slate-500/20 text-slate-700 dark:text-slate-400'}`}
                        >
                          {entry.confidence}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-800 dark:text-slate-200">
                        {formatHits(entry.total_hits)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500 dark:text-slate-500">
                        {entry.ttps.length > 0 ? entry.ttps.length : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3 h-3 text-slate-400" />
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${entry.value}-detail`}>
                        <td
                          colSpan={6}
                          className="px-4 py-3 bg-slate-50 dark:bg-[rgb(var(--surface-100))] border-b border-slate-100 dark:border-[rgb(var(--border-400))]"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                            <div>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">TTPs:</span>{' '}
                              <span className="font-mono text-slate-600 dark:text-slate-400">
                                {entry.ttps.length > 0 ? entry.ttps.join(', ') : 'None mapped'}
                              </span>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">Personas:</span>{' '}
                              <span className="text-slate-600 dark:text-slate-400">{entry.distinct_personas}</span>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">Paths probed:</span>{' '}
                              <span className="font-mono text-slate-600 dark:text-slate-400">
                                {entry.interesting_paths.join(', ') || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="font-semibold text-slate-700 dark:text-slate-300">Prompts:</span>{' '}
                              <span className="text-slate-600 dark:text-slate-400">
                                {formatHits(entry.prompt_count)}
                              </span>
                            </div>
                            {entry.user_agents.length > 0 && (
                              <div className="sm:col-span-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">User Agents:</span>{' '}
                                <span className="font-mono text-slate-600 dark:text-slate-400">
                                  {entry.user_agents.join(', ')}
                                </span>
                              </div>
                            )}
                            {entry.models_requested.length > 0 && (
                              <div className="sm:col-span-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">Models:</span>{' '}
                                <span className="font-mono text-slate-600 dark:text-slate-400">
                                  {entry.models_requested.slice(0, 5).join(', ')}
                                  {entry.models_requested.length > 5 && ` +${entry.models_requested.length - 5} more`}
                                </span>
                              </div>
                            )}
                            {entry.details && (
                              <div className="sm:col-span-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">Details:</span>{' '}
                                <span className="text-slate-600 dark:text-slate-400">{entry.details}</span>
                              </div>
                            )}
                            {entry.sample_prompts.length > 0 && (
                              <div className="sm:col-span-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  Sample Prompts:
                                </span>
                                <div className="mt-1 max-h-24 overflow-y-auto rounded bg-slate-100 dark:bg-slate-800 p-2 font-mono text-[10px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                                  {entry.sample_prompts[0]}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category descriptions */}
      {feed?.taxonomy && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(feed.taxonomy.actor_categories).map(([key, desc]) => {
            const cfg = CATEGORY_CONFIG[key];
            const Icon = cfg?.icon ?? Shield;
            const count = summary?.by_category[key] ?? 0;
            return (
              <div
                key={key}
                className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]"
              >
                <div className={`p-1.5 rounded ${cfg?.color?.split(' ').slice(0, 2).join(' ') ?? 'bg-slate-500/10'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {cfg?.label ?? key}
                    {count > 0 && <span className="ml-1.5 text-slate-500 dark:text-slate-500">({count})</span>}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-500 mt-0.5">{desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confidence levels */}
      {feed?.taxonomy?.confidence_levels && (
        <div className="mt-4 p-3 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Confidence Levels</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(feed.taxonomy.confidence_levels).map(([level, desc]) => (
              <div key={level} className="text-[11px]">
                <span
                  className={`px-1.5 py-0.5 font-medium rounded ${CONFIDENCE_COLORS[level] ?? 'bg-slate-500/20 text-slate-700 dark:text-slate-400'}`}
                >
                  {level}
                </span>
                <span className="ml-1.5 text-slate-600 dark:text-slate-500">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </DataPageLayout>
  );
}

function StatCard({
  label,
  value,
  displayValue,
  color,
}: {
  label: string;
  value: number;
  displayValue?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-3 text-center">
      <div className={`text-xl font-bold ${color}`}>{displayValue ?? formatHits(value)}</div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-600 dark:text-slate-500 mt-0.5">
        {label}
      </div>
    </div>
  );
}
