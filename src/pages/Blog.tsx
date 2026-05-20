import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { DataState } from '../components/DataState';

interface PostEntry {
  slug: string;
  title: string;
  type: string;
  excerpt: string;
  publishedAt: string;
  tags: string[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Stable display order for the type-filter chip strip. Any type not in this
// list still works as a filter but appears at the end in discovery order.
const TYPE_ORDER = ['cve', 'actor', 'malware', 'ransom', 'breach', 'scam', 'aisec', 'intel', 'briefing'] as const;

export default function Blog() {
  const [posts, setPosts] = useState<PostEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/v1/blog/posts')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d: { posts: PostEntry[] } = await r.json();
        if (!cancelled) setPosts(d.posts);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Counts per type so the chip strip can show "actor · 12" — analyst-grade
  // affordance: tells you where the volume is before you filter.
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of posts) m.set(p.type, (m.get(p.type) ?? 0) + 1);
    return m;
  }, [posts]);

  // Sort the present types by canonical order; unknown types sort alphabetic
  // at the tail so a future post type doesn't silently disappear.
  const presentTypes = useMemo(() => {
    const types = Array.from(typeCounts.keys());
    types.sort((a, b) => {
      const ai = (TYPE_ORDER as readonly string[]).indexOf(a);
      const bi = (TYPE_ORDER as readonly string[]).indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return types;
  }, [typeCounts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      if (typeFilter && p.type !== typeFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.excerpt.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [posts, query, typeFilter]);

  const hasFilter = Boolean(query.trim() || typeFilter);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 text-slate-900 dark:text-slate-100">
      <h1 className="font-display text-3xl font-bold tracking-tight mb-2">Case Studies</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
        Security research, threat analysis, and deep dives.
      </p>

      {/* Filter bar — only renders once posts are loaded (avoids a flash of
          empty chips while the data is in flight). */}
      {posts.length > 0 && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 mb-6">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, excerpt, or tag…"
              aria-label="Filter case studies"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
          </div>
          {presentTypes.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <span className="text-[11px] font-mono text-slate-500 mr-1">type:</span>
              {presentTypes.map((t) => {
                const active = typeFilter === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(active ? null : t)}
                    className={`text-[11px] font-mono px-2 py-1 rounded border ${
                      active
                        ? 'border-brand-500/60 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                        : 'border-slate-300 dark:border-slate-700 text-slate-500 hover:border-brand-500/40'
                    }`}
                  >
                    {t} <span className="opacity-70">· {typeCounts.get(t) ?? 0}</span>
                  </button>
                );
              })}
              {hasFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setTypeFilter(null);
                    setQuery('');
                  }}
                  className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline ml-2"
                >
                  clear
                </button>
              )}
            </div>
          )}
          <p className="text-[11px] font-mono text-slate-500 mt-3">
            Showing <span className="text-slate-700 dark:text-slate-300">{filtered.length}</span> of{' '}
            <span className="text-slate-700 dark:text-slate-300">{posts.length}</span> case studies.
          </p>
        </section>
      )}

      <DataState
        loading={loading}
        error={error}
        empty={filtered.length === 0}
        emptyLabel={hasFilter ? 'No case studies match the current filter.' : 'No case studies published yet.'}
        onRetry={() => setReloadKey((k) => k + 1)}
        rows={6}
      >
        <div className="space-y-8">
          {filtered.map((p) => (
            <article key={p.slug}>
              <Link to={`/blog/${p.slug}`} className="group block">
                <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">
                  {p.type}
                </span>
                <h2 className="font-display text-xl font-semibold mt-1 text-slate-900 dark:text-slate-100 transition-colors group-hover:text-brand-600 dark:group-hover:text-brand-400">
                  {p.title}
                </h2>
                <p className="text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">{p.excerpt}</p>
              </Link>
              <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                <span>Pranith Jain</span>
                <span aria-hidden="true">·</span>
                <time>{formatDate(p.publishedAt)}</time>
              </div>
              {p.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {p.tags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setQuery(t)}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-mono text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                      title={`Filter by tag: ${t}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </DataState>
    </main>
  );
}
