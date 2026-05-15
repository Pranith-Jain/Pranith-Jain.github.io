import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson } from './adminApi';

interface PostEntry {
  slug: string;
  title: string;
  type: 'cve' | 'actor' | 'malware' | 'ransom';
  excerpt: string;
  publishedAt: string;
  tags: string[];
}

export default function PublishedTab() {
  const [posts, setPosts] = useState<PostEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const d = await getJson<{ posts: PostEntry[] }>('/posts');
      setPosts(d.posts);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unpublish(slug: string) {
    try {
      await postJson(`/posts/${encodeURIComponent(slug)}/unpublish`);
      await load();
    } catch {
      setError(true);
    }
  }

  if (loading) return <p className="text-zinc-400">Loading…</p>;
  if (error)
    return (
      <div>
        <p className="text-red-400 mb-2">Failed to load</p>
        <button onClick={load} className="px-3 py-1 border border-zinc-700 rounded text-sm">
          Retry
        </button>
      </div>
    );
  if (posts.length === 0) return <p className="text-zinc-400">No published posts.</p>;

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
        <tr>
          <th scope="col" className="py-2 pr-4">
            Type
          </th>
          <th scope="col" className="py-2 pr-4">
            Title
          </th>
          <th scope="col" className="py-2 pr-4">
            Published
          </th>
          <th scope="col" className="py-2 pr-4">
            Slug
          </th>
          <th scope="col" className="py-2">
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        {posts.map((p) => (
          <tr key={p.slug} className="border-b border-zinc-800/60">
            <td className="py-2 pr-4 text-zinc-400 uppercase text-xs">{p.type}</td>
            <td className="py-2 pr-4 text-zinc-100">{p.title}</td>
            <td className="py-2 pr-4 text-zinc-500 text-xs whitespace-nowrap">
              {new Date(p.publishedAt).toLocaleString()}
            </td>
            <td className="py-2 pr-4">
              <a
                href={`/blog/${p.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-zinc-300 hover:underline"
              >
                {p.slug}
              </a>
            </td>
            <td className="py-2">
              <button
                onClick={() => unpublish(p.slug)}
                className="px-2 py-1 border border-zinc-700 rounded text-xs hover:bg-zinc-800"
              >
                Unpublish
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
