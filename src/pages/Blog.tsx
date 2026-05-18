import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

export default function Blog() {
  const [posts, setPosts] = useState<PostEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 text-slate-900 dark:text-slate-100">
      <h1 className="font-display text-3xl font-bold tracking-tight mb-2">Case Studies</h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
        Security research, threat analysis, and deep dives.
      </p>
      <DataState
        loading={loading}
        error={error}
        empty={posts.length === 0}
        emptyLabel="No case studies published yet."
        onRetry={() => setReloadKey((k) => k + 1)}
        rows={6}
      >
        <div className="space-y-8">
          {posts.map((p) => (
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
                    <span
                      key={t}
                      className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-mono text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
                    >
                      {t}
                    </span>
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
