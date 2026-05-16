import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

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

  useEffect(() => {
    fetch('/api/v1/blog/posts')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d: { posts: PostEntry[] } = await r.json();
        setPosts(d.posts);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-2">Case Studies</h1>
      <p className="text-zinc-500 mb-8">Security research, threat analysis, and deep dives.</p>
      {loading && <p className="text-zinc-400">Loading…</p>}
      {error && <p className="text-red-500">Error: {error}</p>}
      {!loading && !error && posts.length === 0 && <p className="text-zinc-400">No posts yet.</p>}
      <div className="space-y-8">
        {posts.map((p) => (
          <article key={p.slug}>
            <Link to={`/blog/${p.slug}`} className="group block">
              <span className="text-xs uppercase tracking-wider text-zinc-500">{p.type}</span>
              <h2 className="text-xl font-semibold group-hover:text-brand-400 transition-colors mt-0.5">{p.title}</h2>
              <p className="text-zinc-400 mt-1.5 leading-relaxed">{p.excerpt}</p>
            </Link>
            <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
              <span>Pranith Jain</span>
              <span aria-hidden="true">·</span>
              <time>{formatDate(p.publishedAt)}</time>
            </div>
            {p.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {p.tags.map((t) => (
                  <span key={t} className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-mono text-zinc-400">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
