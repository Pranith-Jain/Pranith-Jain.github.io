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
      <h1 className="text-3xl font-bold mb-6">Case Studies</h1>
      {loading && <p className="text-zinc-400">Loading…</p>}
      {error && <p className="text-red-500">Error: {error}</p>}
      {!loading && !error && posts.length === 0 && <p className="text-zinc-400">No posts yet.</p>}
      <ul className="space-y-6">
        {posts.map((p) => (
          <li key={p.slug} className="border-b border-zinc-800 pb-4">
            <span className="text-xs uppercase tracking-wider text-zinc-500">{p.type}</span>
            <h2 className="text-xl font-semibold">
              <Link to={`/blog/${p.slug}`} className="hover:underline">
                {p.title}
              </Link>
            </h2>
            <p className="text-zinc-400 mt-1">{p.excerpt}</p>
            <time className="text-xs text-zinc-500">{new Date(p.publishedAt).toLocaleDateString()}</time>
          </li>
        ))}
      </ul>
    </main>
  );
}
