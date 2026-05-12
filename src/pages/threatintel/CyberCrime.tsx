import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, ArrowLeft, ExternalLink, Loader2, RefreshCw, Search } from 'lucide-react';

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

type Category = 'law-enforcement' | 'crypto-crime' | 'news' | 'breaches' | 'fraud-research';

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
  news: 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400',
  breaches: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  'fraud-research': 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

const CATEGORY_LABEL: Record<Category, string> = {
  'law-enforcement': 'Law enforcement',
  'crypto-crime': 'Crypto crime',
  news: 'News',
  breaches: 'Breaches',
  'fraud-research': 'Fraud research',
};

function shortRel(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function CyberCrime(): JSX.Element {
  const [data, setData] = useState<CybercrimeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/v1/cyber-crime')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<CybercrimeResponse>;
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
  }, [refreshKey]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.items;
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
  }, [data, query, activeCategory]);

  const categoryCounts = useMemo(() => {
    const counts: Record<Category, number> = {
      'law-enforcement': 0,
      'crypto-crime': 0,
      news: 0,
      breaches: 0,
      'fraud-research': 0,
    };
    if (data) for (const it of data.items) counts[it.category]++;
    return counts;
  }, [data]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <AlertOctagon size={28} className="text-rose-600 dark:text-rose-400" /> Cyber crime &amp; fraud feeds
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-3xl">
          Live coverage of cyber crime incidents — indictments, takedowns, crypto-crime tracing, BEC and romance-scam
          schemes, sanctions, breach reporting. Aggregated from US DOJ, CISA, Chainalysis, Elliptic, Krebs on Security,
          The Record, BleepingComputer, DataBreaches.net, and HackRead. Round-robin selection means no single chatty
          source dominates the visible top.
        </p>
      </div>

      {error && <p className="font-mono text-sm text-rose-600 dark:text-rose-400 mb-4">error: {error}</p>}

      {/* Category filter pills */}
      {data && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
              activeCategory === 'all'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-slate-700 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                  : 'border-slate-300 dark:border-slate-700 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {CATEGORY_LABEL[cat]} <span className="text-slate-500">{categoryCounts[cat]}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
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
          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
        />
      </div>

      {loading && !data && (
        <p className="font-mono text-sm text-slate-500 inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> loading feeds…
        </p>
      )}

      {data && (
        <ul className="space-y-3">
          {filtered.map((it, i) => (
            <li
              key={`${it.url}-${i}`}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-brand-500/40 transition-colors"
            >
              <div className="flex flex-wrap items-baseline gap-2 mb-2">
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 break-words"
                >
                  {it.title} <ExternalLink size={11} className="inline ml-0.5 opacity-60" />
                </a>
                <span
                  className={`text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded border ${CATEGORY_PILL[it.category]}`}
                  title={CATEGORY_LABEL[it.category]}
                >
                  {CATEGORY_LABEL[it.category]}
                </span>
                <span className="text-[10px] font-mono text-slate-500" title={formatDate(it.published)}>
                  {shortRel(it.published) || formatDate(it.published)}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-1">{it.source}</div>
              {it.description && (
                <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                  {it.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && filtered.length === 0 && data && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-mono text-slate-500">
          No items match the current filter.
        </div>
      )}

      {/* Source status footer */}
      {data && (
        <details className="mt-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
          <summary className="text-xs font-mono text-slate-500 cursor-pointer">
            source status — {data.sources.filter((s) => s.ok).length}/{data.sources.length} ok
          </summary>
          <div className="mt-3 grid sm:grid-cols-2 gap-1.5 text-[11px] font-mono">
            {data.sources.map((s) => (
              <div key={s.label} className="flex items-baseline justify-between gap-2">
                <span className={s.ok ? 'text-slate-700 dark:text-slate-300' : 'text-rose-600 dark:text-rose-400'}>
                  {s.ok ? '✓' : '✗'} {s.label}
                </span>
                <span className="text-slate-500">
                  {s.count}
                  {s.filtered_out ? ` (-${s.filtered_out})` : ''}
                  {s.error ? ` · ${s.error}` : ''}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
