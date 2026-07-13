import { useEffect, useMemo, useState } from 'react';
import { relativeAgo as shortRel } from '../../lib/relativeTime';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { useSearchParams } from 'react-router-dom';
import { AlertOctagon, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import { AiSummaryCard } from '../../components/intel/AiSummaryCard';

/**
 * /threatintel/cyber-crime — live aggregation of cyber fraud + cyber crime
 * news from law-enforcement, crypto-crime trackers, fraud-research blogs,
 * and breach reporters.
 *
 * Source list + filter keywords live in api/src/lib/cybercrime-sources.ts.
 * Pulled live via /api/v1/cyber-crime (RSS in, unified JSON out).
 *
 * Distinct from /threatintel/writeups (CTI research articles) — this
 * surface is about INCIDENTS: indictments, takedowns, schemes, sanctions.
 */

type Category = 'law-enforcement' | 'crypto-crime' | 'news' | 'breaches' | 'fraud-research' | 'underground-forums';

interface CybercrimeItem {
  title: string;
  url: string;
  source: string;
  category: Category;
  published?: string;
  description?: string;
  tags?: string[];
}

interface CybercrimeResponse {
  generated_at: string;
  sources: Array<{
    label: string;
    category: string;
    ok: boolean;
    count: number;
    filtered_out?: number;
    error?: string;
  }>;
  total: number;
  items: CybercrimeItem[];
}

const CATEGORY_PILL: Record<Category, string> = {
  'law-enforcement': 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  'crypto-crime': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  news: 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted',
  breaches: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  'fraud-research': 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'underground-forums': 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300',
};

const CATEGORY_LABEL: Record<Category, string> = {
  'law-enforcement': 'Law enforcement',
  'crypto-crime': 'Crypto crime',
  news: 'News',
  breaches: 'Breaches',
  'fraud-research': 'Fraud research',
  'underground-forums': 'Underground forums',
};

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const ALL_CATEGORIES_FOR_URL = ['all'] as const;

const SOURCES_STORAGE_KEY = 'cyber-crime:disabled-sources';

function loadDisabledSources(): Set<string> {
  try {
    const raw = localStorage.getItem(SOURCES_STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch (_catchErr) {
    console.error('loadDisabledSources failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return new Set();
  }
}

export default function CyberCrime(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<CybercrimeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [refreshKey, setRefreshKey] = useState(0);
  const [disabledSources, setDisabledSources] = useState<Set<string>>(() => loadDisabledSources());
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>(() => {
    const cat = searchParams.get('cat');
    if (cat && cat in CATEGORY_LABEL) return cat as Category;
    return ALL_CATEGORIES_FOR_URL[0];
  });

  useEffect(() => {
    try {
      localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify([...disabledSources]));
    } catch (_catchErr) {
      console.error('CyberCrime failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* localStorage unavailable */
    }
  }, [disabledSources]);

  const toggleSource = (label: string) => {
    setDisabledSources((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // Keep filter state in the URL so a curated view is shareable.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (query.trim()) out.set('q', query.trim());
        else out.delete('q');
        if (activeCategory !== 'all') out.set('cat', activeCategory);
        else out.delete('cat');
        return out;
      },
      { replace: true }
    );
  }, [query, activeCategory, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/v1/cyber-crime', { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) })
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<CybercrimeResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (cancelled || (e instanceof Error && e.name === 'AbortError')) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.items;
    if (disabledSources.size > 0) {
      items = items.filter((it) => !disabledSources.has(it.source));
    }
    if (activeCategory !== 'all') items = items.filter((it) => it.category === activeCategory);
    const q = query.trim().toLowerCase();
    if (q) {
      items = items.filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          (it.description?.toLowerCase().includes(q) ?? false) ||
          it.source.toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, query, activeCategory, disabledSources]);

  const categoryCounts = useMemo(() => {
    const counts: Record<Category, number> = {
      'law-enforcement': 0,
      'crypto-crime': 0,
      news: 0,
      breaches: 0,
      'fraud-research': 0,
      'underground-forums': 0,
    };
    if (data) for (const it of data.items) counts[it.category]++;
    return counts;
  }, [data]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <AlertOctagon size={28} className="text-rose-600 dark:text-rose-400" /> Cyber crime &amp; fraud feeds
        </h1>
        <p className="text-muted mb-8 max-w-3xl">
          Live coverage of cyber crime incidents — indictments, takedowns, crypto-crime tracing, BEC and romance-scam
          schemes, sanctions, breach reporting. Aggregated from US DOJ, CISA, Chainalysis, Elliptic, Krebs on Security,
          The Record, BleepingComputer, DataBreaches.net, and HackRead. Round-robin selection means no single chatty
          source dominates the visible top.
        </p>
      </div>

      {/* Category filter pills */}
      {data && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
              activeCategory === 'all'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]'
            }`}
          >
            all <span className="text-slate-500">{data.total}</span>
          </button>
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
                activeCategory === cat
                  ? CATEGORY_PILL[cat]
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]'
              }`}
            >
              {CATEGORY_LABEL[cat]} <span className="text-slate-500">{categoryCounts[cat]}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] disabled:opacity-50"
            title="Re-fetch the feed"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> refresh
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, description, source…"
          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
        />
      </div>

      {filtered.length > 0 && (
        <AiSummaryCard
          surface="Cybercrime"
          items={filtered.slice(0, 30).map((it) => ({
            title: it.title,
            body: it.description ?? '',
            source: it.source,
          }))}
        />
      )}

      <DataState
        loading={loading && !data}
        error={error}
        empty={!!data && !loading && filtered.length === 0}
        emptyLabel="No items match the current filter."
        onRetry={() => setRefreshKey((k) => k + 1)}
        rows={8}
      >
        <ul className="space-y-3">
          {filtered.map((it, i) => (
            <li
              key={`${it.url}-${i}`}
              className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 hover:border-brand-500/40 transition-colors"
            >
              <div className="flex flex-wrap items-baseline gap-2 mb-2">
                <a
                  href={sanitizeUrl(it.url) || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 break-words"
                >
                  {it.title} <ExternalLink size={11} className="inline ml-0.5 opacity-60" />
                </a>
                <span
                  className={`text-micro font-mono uppercase tracking-wider px-1 py-0.5 rounded border ${CATEGORY_PILL[it.category]}`}
                  title={CATEGORY_LABEL[it.category]}
                >
                  {CATEGORY_LABEL[it.category]}
                </span>
                <span className="text-micro font-mono text-slate-500" title={formatDate(it.published)}>
                  {shortRel(it.published) || formatDate(it.published)}
                </span>
              </div>
              <div className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-1">{it.source}</div>
              {it.description && (
                <p className="text-meta font-mono text-muted leading-relaxed line-clamp-3">{it.description}</p>
              )}
            </li>
          ))}
        </ul>
      </DataState>

      {/* Source picker + status. Click a row to toggle that source on/off
          (persisted in localStorage). Disabling hides items locally but
          still pulls from the server — the round-robin still fires. */}
      {data && (
        <details className="mt-8 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3">
          <summary className="text-xs font-mono text-slate-500 cursor-pointer flex items-center justify-between gap-2 flex-wrap">
            <span>
              sources — {data.sources.length - disabledSources.size}/{data.sources.length} enabled ·{' '}
              {data.sources.filter((s) => s.ok).length}/{data.sources.length} ok
            </span>
            {disabledSources.size > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setDisabledSources(new Set());
                }}
                className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40"
              >
                enable all
              </button>
            )}
          </summary>
          <p className="mt-2 text-micro font-mono text-slate-500">
            Click any source row to toggle it. Preference persists per browser.
          </p>
          <div className="mt-2 grid sm:grid-cols-2 gap-1.5 text-mini font-mono">
            {data.sources.map((s) => {
              const enabled = !disabledSources.has(s.label);
              return (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => toggleSource(s.label)}
                  className={`flex items-baseline justify-between gap-2 rounded px-2 py-1 text-left transition-colors border ${
                    enabled
                      ? 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:border-brand-500/40'
                      : 'border-slate-200/40 dark:border-[rgb(var(--border-400))]/40 bg-slate-100/40 dark:bg-[rgb(var(--input-200)/0.4)] opacity-60'
                  }`}
                >
                  <span className={s.ok ? 'text-slate-700 dark:text-slate-300' : 'text-rose-600 dark:text-rose-400'}>
                    {enabled ? (s.ok ? '✓' : '✗') : '○'} {s.label}
                  </span>
                  <span className="text-slate-500">
                    {s.count}
                    {s.filtered_out ? ` (-${s.filtered_out})` : ''}
                    {s.error ? ` · ${s.error}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
