import { useCallback, useEffect, useState, useRef } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { AlertTriangle, Bot, ExternalLink, Globe, RefreshCw, Server, Shield, Skull, Wifi } from 'lucide-react';

/**
 * AI Honeypot Observatory — LLM/AI endpoint honeypot intelligence.
 *
 * Pulls IOC feed from ai-honeypots.com (CC0 1.0 licensed) and displays
 * attacker categories, top IPs, and attack volume. Links to the full
 * live dashboard for real-time monitoring.
 *
 * Feed: https://ai-honeypots.com/feeds/iocs.txt
 * Dashboard: https://ai-honeypots.com
 */

const FEED_URL = 'https://ai-honeypots.com/feeds/iocs.txt';
const DASHBOARD_URL = 'https://ai-honeypots.com';

interface IocEntry {
  ip: string;
  category: string;
  confidence: string;
  hits: number;
}

interface FeedMeta {
  published: string;
  window: string;
  totalIps: number;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: typeof Shield; description: string }> = {
  'MCP-SCANNER': {
    label: 'MCP Scanner',
    color: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
    icon: Server,
    description: 'Scanning for exposed MCP (Model Context Protocol) endpoints',
  },
  'CREDENTIAL-HARVESTER': {
    label: 'Credential Harvester',
    color: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
    icon: Skull,
    description: 'Harvesting credentials from LLM/AI authentication endpoints',
  },
  'RELAY-VERIFIER': {
    label: 'Relay Verifier',
    color: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
    icon: Globe,
    description: 'Verifying relay/proxy infrastructure for LLM abuse',
  },
  'SCANNER-ENUM': {
    label: 'Scanner (Enum)',
    color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    icon: Wifi,
    description: 'Enumerating AI/LLM service versions and endpoints',
  },
  'SCANNER-MASS': {
    label: 'Mass Scanner',
    color: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
    icon: AlertTriangle,
    description: 'Mass scanning for exposed LLM inference endpoints',
  },
  'IDENTITY-PROBER': {
    label: 'Identity Prober',
    color: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20',
    icon: Bot,
    description: 'Probing AI identity/authentication systems',
  },
  'RELAY-CUSTOMER': {
    label: 'Relay Customer',
    color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    icon: Shield,
    description: 'End-users abusing LLM relay/proxy services',
  },
  'RELAY-CATALOGER': {
    label: 'Relay Cataloger',
    color: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20',
    icon: Globe,
    description: 'Cataloging available LLM relay/proxy endpoints',
  },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  'very-high': 'bg-red-500/20 text-red-700 dark:text-red-400',
  high: 'bg-orange-500/20 text-orange-700 dark:text-orange-400',
  medium: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
  low: 'bg-slate-500/20 text-slate-700 dark:text-slate-400',
};

function parseFeed(text: string): { meta: FeedMeta; entries: IocEntry[] } {
  const lines = text.split('\n');
  const meta: FeedMeta = { published: '', window: '', totalIps: 0 };
  const entries: IocEntry[] = [];

  for (const line of lines) {
    if (line.startsWith('#')) {
      if (line.includes('Published:')) meta.published = line.split(':').slice(1).join(':').trim();
      if (line.includes('Window:')) meta.window = line.split(':').slice(1).join(':').trim();
      if (line.includes('Total IPs:')) meta.totalIps = parseInt(line.split(':').slice(-1)[0]?.trim() ?? '0', 10);
      continue;
    }
    if (!line.trim()) continue;
    const match = line.match(/^(\S+)\s+#\s+(\S+)\s+\|\s+conf:(\S+)\s+\|\s+hits:(\d+)/);
    if (match && match[1] && match[2] && match[3] && match[4]) {
      entries.push({
        ip: match[1],
        category: match[2],
        confidence: match[3],
        hits: parseInt(match[4], 10),
      });
    }
  }
  return { meta, entries };
}

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
  const [entries, setEntries] = useState<IocEntry[]>([]);
  const [meta, setMeta] = useState<FeedMeta>({ published: '', window: '', totalIps: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const fetchFeed = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const signal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]);
      const res = await fetch(FEED_URL, { signal });
      if (!res.ok) throw new Error(`Feed returned ${res.status}`);
      const text = await res.text();
      if (ctrl.signal.aborted) return;
      const parsed = parseFeed(text);
      setEntries(parsed.entries);
      setMeta(parsed.meta);
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

  const filtered = entries.filter((e) => {
    if (categoryFilter && e.category !== categoryFilter) return false;
    if (confidenceFilter && e.confidence !== confidenceFilter) return false;
    if (searchQuery && !e.ip.includes(searchQuery) && !e.category.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    return true;
  });

  const categoryStats = entries.reduce(
    (acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const totalHits = entries.reduce((s, e) => s + e.hits, 0);

  return (
    <DataPageLayout
      backTo="/threatintel/infra"
      title="AI Honeypot Observatory"
      description="LLM/AI endpoint honeypot intelligence — attacker categories, top IPs, and attack volume from ai-honeypots.com (CC0 1.0)"
      icon={<Bot size={28} />}
    >
      {/* Header stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Attacker IPs" value={meta.totalIps || entries.length} color="text-slate-900 dark:text-white" />
        <StatCard label="Total Hits" value={totalHits} color="text-red-700 dark:text-red-400" />
        <StatCard
          label="Categories"
          value={Object.keys(categoryStats).length}
          color="text-blue-700 dark:text-blue-400"
        />
        <StatCard
          label="Window"
          value={0}
          displayValue={meta.window || '7 days'}
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
          {meta.published && (
            <span className="ml-2 text-slate-500 dark:text-slate-500">
              Published {relativeTime(meta.published) || meta.published}
            </span>
          )}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={FEED_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Raw Feed
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
            href={DASHBOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Live Dashboard
          </a>
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 dark:text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && <div className="text-center py-8 text-red-600 dark:text-red-400">{error}</div>}

      {/* Category breakdown */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          {Object.entries(categoryStats)
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
                  <div className="text-[10px] text-slate-500 dark:text-slate-500">
                    {formatHits(entries.filter((e) => e.category === cat).reduce((s, e) => s + e.hits, 0))} hits
                  </div>
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
          {filtered.length} / {entries.length} IPs
        </span>
      </div>

      {/* IP table */}
      <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-400">IP Address</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-400">Category</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-400">Confidence</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-400">Hits</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500 dark:text-slate-500">
                    Loading IOC feed...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-500 dark:text-slate-500">
                    No entries match your filters.
                  </td>
                </tr>
              )}
              {filtered.map((entry) => {
                const cfg = CATEGORY_CONFIG[entry.category];
                return (
                  <tr
                    key={entry.ip}
                    className="border-b border-slate-100 dark:border-[rgb(var(--border-400))] last:border-0 hover:bg-slate-50 dark:hover:bg-[rgb(var(--hover-100))]"
                  >
                    <td className="px-3 py-2 font-mono text-slate-800 dark:text-slate-200">{entry.ip}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${cfg?.color ?? 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20'}`}
                      >
                        {cfg?.label ?? entry.category}
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
                      {formatHits(entry.hits)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category descriptions */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = categoryStats[key] ?? 0;
          return (
            <div
              key={key}
              className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]"
            >
              <div className={`p-1.5 rounded ${cfg.color.split(' ').slice(0, 2).join(' ')}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {cfg.label}
                  {count > 0 && <span className="ml-1.5 text-slate-500 dark:text-slate-500">({count})</span>}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-500 mt-0.5">{cfg.description}</div>
              </div>
            </div>
          );
        })}
      </div>
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
