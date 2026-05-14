import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface Post {
  slug: string;
  title: string;
  type: string;
  publishedAt: string;
  body: string;
  hero: string;
  iocs: { type: string; value: string }[];
  tags: string[];
}

export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [html, setHtml] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/blog/posts/${slug}`).then(async (r) => {
      if (r.status === 404) {
        if (!cancelled) setNotFound(true);
        return;
      }
      const data = (await r.json()) as { post: Post };
      if (cancelled) return;
      setPost(data.post);
      // Dynamic import keeps marked off the initial bundle and matches the
      // pattern already used by WikiArticle.
      const { marked } = await import('marked');
      const rendered = marked.parse(data.post.body, { async: false }) as string;
      if (!cancelled) setHtml(rendered);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (notFound) return <p className="p-10">Post not found.</p>;
  if (!post) return <p className="p-10">Loading…</p>;

  return (
    <article className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-6" dangerouslySetInnerHTML={{ __html: post.hero }} />
      <header className="mb-6">
        <span className="text-xs uppercase tracking-wider text-zinc-500">{post.type}</span>
        <h1 className="text-3xl font-bold">{post.title}</h1>
        <time className="text-sm text-zinc-500">{new Date(post.publishedAt).toLocaleDateString()}</time>
      </header>
      <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
      {post.iocs.length > 0 && (
        <aside className="mt-10 border-t border-zinc-800 pt-6">
          <h2 className="text-sm uppercase tracking-wider text-zinc-500 mb-2">IOCs</h2>
          <ul className="text-sm font-mono space-y-1">
            {post.iocs.map((i, k) => (
              <li key={k}>
                <a href={`/dfir/ioc-check?q=${encodeURIComponent(i.value)}`} className="hover:underline">
                  [{i.type}] {i.value}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </article>
  );
}
