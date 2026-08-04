import { useEffect, useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { sanitizeUrl } from '../../lib/sanitize-url';
import {
  Activity,
  ExternalLink,
  Fingerprint,
  Globe,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldOff,
  Star,
  Zap,
} from 'lucide-react';

interface DarknetSite {
  slug: string;
  name: string;
  dwdId: string | null;
  category: string;
  status: 'up' | 'down' | 'unknown';
  upMirrors: number;
  totalMirrors: number;
  recommended: boolean;
  isOnion: boolean;
  url?: string | null;
  onion?: string | null;
  latencyMs?: number | null;
  httpCode?: string | null;
  pageSize?: string | null;
  fingerprint?: string | null;
}

interface DarknetCategory {
  id: string;
  title: string;
  description: string;
  siteCount: number;
  mirrorCount: number;
  upCount: number;
}

interface DarknetIndex {
  source: string;
  url: string;
  description: string;
  rebuiltAt: string;
  syncedAt: string;
  counts: {
    categories: number;
    sites: number;
    up: number;
    down: number;
    recommended: number;
    onion: number;
  };
  categories: DarknetCategory[];
  sites: DarknetSite[];
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  markets: { label: 'Markets', icon: ShieldAlert, color: 'text-rose-600 dark:text-rose-400' },
  search: { label: 'Search', icon: Search, color: 'text-sky-600 dark:text-sky-400' },
  forums: { label: 'Forums', icon: Globe, color: 'text-violet-600 dark:text-violet-400' },
  news: { label: 'News', icon: Globe, color: 'text-amber-600 dark:text-amber-400' },
  security: { label: 'Security', icon: Shield, color: 'text-emerald-600 dark:text-emerald-400' },
  communications: { label: 'Comms', icon: Globe, color: 'text-cyan-600 dark:text-cyan-400' },
  crypto: { label: 'Crypto', icon: Zap, color: 'text-orange-600 dark:text-orange-400' },
  tools: { label: 'Tools', icon: Shield, color: 'text-indigo-600 dark:text-indigo-400' },
  ai: { label: 'AI', icon: Activity, color: 'text-fuchsia-600 dark:text-fuchsia-400' },
};

function StatusBadge({ status }: { status: DarknetSite['status'] }) {
  if (status === 'up') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> ONLINE
      </span>
    );
  }
  if (status === 'down') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> DOWN
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> UNKNOWN
    </span>
  );
}

function SiteCard({ site }: { site: DarknetSite }) {
  const catMeta = CATEGORY_META[site.category] ?? {
    label: site.category,
    icon: Globe,
    color: 'text-muted',
  };
  const safeUrl = site.url ? sanitizeUrl(site.url) : null;

  return (
    <div className="group relative flex flex-col gap-2 rounded-lg border border-[rgb(var(--border-300))] bg-card p-4 transition-colors hover:border-[rgb(var(--border-400))]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-foreground">{site.name}</h3>
            {site.recommended && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                <Star className="h-3 w-3" /> REC
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <span className={`inline-flex items-center gap-1 ${catMeta.color}`}>
              <catMeta.icon className="h-3 w-3" />
              {catMeta.label}
            </span>
            {site.dwdId && <span className="font-mono">{site.dwdId}</span>}
          </div>
        </div>
        <StatusBadge status={site.status} />
      </div>

      {safeUrl && (
        <a
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="flex items-center gap-1 truncate text-xs text-sky-600 hover:underline dark:text-sky-400"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate font-mono">{site.onion ?? site.url}</span>
        </a>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Activity className="h-3 w-3" />
          {site.upMirrors}/{site.totalMirrors} mirrors
        </span>
        {site.latencyMs != null && (
          <span className="inline-flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {site.latencyMs}ms
          </span>
        )}
        {site.httpCode && site.httpCode !== 'n/a' && (
          <span className="font-mono">HTTP {site.httpCode}</span>
        )}
        {site.pageSize && <span>{site.pageSize}</span>}
        {site.fingerprint && (
          <span className="inline-flex items-center gap-1 font-mono">
            <Fingerprint className="h-3 w-3" />
            {site.fingerprint}
          </span>
        )}
        {site.isOnion && (
          <span className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400">
            <ShieldOff className="h-3 w-3" />.onion
          </span>
        )}
      </div>
    </div>
  );
}

export default function DarknetList(): JSX.Element {
  const [data, setData] = useState<DarknetIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'up' | 'down'>('all');
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/threat-intel/darknet');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DarknetIndex;
      // Fetch full site list with details
      const sitesRes = await fetch('/api/v1/threat-intel/darknet/sites?limit=500');
      if (sitesRes.ok) {
        const sitesJson = (await sitesRes.json()) as { sites: DarknetSite[] };
        json.sites = sitesJson.sites;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = query.toLowerCase().trim();
    return data.sites.filter((s) => {
      if (category !== 'all' && s.category !== category) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (recommendedOnly && !s.recommended) return false;
      if (needle) {
        const hay = `${s.name} ${s.dwdId ?? ''} ${s.category}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [data, category, statusFilter, recommendedOnly, query]);

  const categoryCounts = useMemo(() => {
    if (!data) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const s of data.sites) {
      m.set(s.category, (m.get(s.category) ?? 0) + 1);
    }
    return m;
  }, [data]);

  return (
    <DataPageLayout
      backTo="/threatintel/darkweb"
      backLabel="Dark Web"
      icon={<Globe className="h-5 w-5" />}
      title="Darknet Directory"
      description={
        <span>
          A live directory of Tor-accessible sites from{' '}
          <a
            href="https://darknetlist.is/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 hover:underline dark:text-sky-400"
          >
            darknetlist.is
          </a>
          . A scanner walks the list through a fresh SOCKS circuit every 30 minutes.
        </span>
      }
      headerExtra={
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-[rgb(var(--border-300))] px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      }
      loading={loading && !data}
      error={error}
      onRetry={load}
    >
      {data && (
        <>
          {/* Stats bar */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Sites" value={data.counts.sites} />
            <StatCard label="Online" value={data.counts.up} tone="emerald" />
            <StatCard label="Down" value={data.counts.down} tone="rose" />
            <StatCard label="Recommended" value={data.counts.recommended} tone="amber" />
            <StatCard label=".onion" value={data.counts.onion} tone="violet" />
            <StatCard label="Categories" value={data.counts.categories} />
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sites by name, DWD ID, or category…"
                className="w-full rounded-md border border-[rgb(var(--border-300))] bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'up' | 'down')}
              className="rounded-md border border-[rgb(var(--border-300))] bg-card px-3 py-2 text-sm text-foreground focus:border-sky-500 focus:outline-none"
            >
              <option value="all">All status</option>
              <option value="up">Online only</option>
              <option value="down">Down only</option>
            </select>
            <button
              onClick={() => setRecommendedOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                recommendedOnly
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : 'border-[rgb(var(--border-300))] text-muted hover:bg-muted/50'
              }`}
            >
              <Star className="h-4 w-4" />
              Recommended
            </button>
          </div>

          {/* Category tabs */}
          <div className="mb-4 flex flex-wrap gap-1.5">
            <CategoryTab
              active={category === 'all'}
              onClick={() => setCategory('all')}
              label="All"
              count={data.sites.length}
            />
            {data.categories.map((cat) => (
              <CategoryTab
                key={cat.id}
                active={category === cat.id}
                onClick={() => setCategory(cat.id)}
                label={CATEGORY_META[cat.id]?.label ?? cat.title}
                count={categoryCounts.get(cat.id) ?? 0}
              />
            ))}
          </div>

          {/* Results */}
          <div className="mb-2 text-sm text-muted">
            Showing {filtered.length} of {data.sites.length} sites
            {data.rebuiltAt && (
              <span className="ml-2">
                · rebuilt{' '}
                {new Date(data.rebuiltAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[rgb(var(--border-300))] p-12 text-center text-muted">
              No sites match your filters.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((site) => (
                <SiteCard key={site.slug} site={site} />
              ))}
            </div>
          )}
        </>
      )}
    </DataPageLayout>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'emerald' | 'rose' | 'amber' | 'violet';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'rose'
        ? 'text-rose-600 dark:text-rose-400'
        : tone === 'amber'
          ? 'text-amber-600 dark:text-amber-400'
          : tone === 'violet'
            ? 'text-violet-600 dark:text-violet-400'
            : 'text-foreground';
  return (
    <div className="rounded-lg border border-[rgb(var(--border-300))] bg-card p-3">
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function CategoryTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
        active
          ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
          : 'border-[rgb(var(--border-300))] text-muted hover:bg-muted/50'
      }`}
    >
      {label}
      <span className="rounded-full bg-muted/50 px-1.5 text-xs">{count}</span>
    </button>
  );
}
