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
    fetch(`/api/v1/blog/posts/${encodeURIComponent(slug ?? '')}`).then(async (r) => {
      if (r.status === 404 || r.status === 400) {
        if (!cancelled) setNotFound(true);
        return;
      }
      const data = (await r.json()) as { post: Post; bodyHtml: string };
      if (cancelled) return;
      setPost(data.post);
      // bodyHtml is sanitized server-side (api/src/case-study/rendering/
      // markdown.ts). The client must NOT re-parse post.body itself —
      // marked does not sanitize and the body is attacker-influenceable.
      setHtml(data.bodyHtml ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (notFound) return <p className="p-10">Post not found.</p>;
  if (!post) return <p className="p-10">Loading…</p>;

  return (
    <article className="max-w-3xl mx-auto px-6 py-10">
      {/* hero is server-generated SVG. Render it through an <img> data URI so
          the markup is inert (never parsed as live DOM in this origin). */}
      <img className="mb-6 w-full rounded-lg" alt="" src={`data:image/svg+xml;utf8,${encodeURIComponent(post.hero)}`} />
      <header className="mb-6">
        <span className="text-xs uppercase tracking-wider text-zinc-500">{post.type}</span>
        <h1 className="text-3xl font-bold">{post.title}</h1>
        <time className="text-sm text-zinc-500">{new Date(post.publishedAt).toLocaleDateString()}</time>
      </header>
      <div
        className="[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-zinc-100 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-zinc-200 [&_p]:text-zinc-300 [&_p]:leading-relaxed [&_p]:mb-4 [&_a]:text-brand-400 [&_a]:hover:underline [&_strong]:text-zinc-100 [&_code]:text-brand-400 [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_pre]:bg-zinc-900 [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:mb-4 [&_pre]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:text-zinc-300 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_ol]:text-zinc-300 [&_li]:mb-1 [&_blockquote]:border-l-4 [&_blockquote]:border-brand-400 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-zinc-400 [&_blockquote]:mb-4 [&_hr]:border-zinc-800 [&_hr]:my-8 [&_table]:w-full [&_table]:border-collapse [&_table]:mb-4 [&_th]:border [&_th]:border-zinc-800 [&_th]:p-2 [&_th]:text-left [&_th]:text-zinc-200 [&_th]:bg-zinc-900 [&_td]:border [&_td]:border-zinc-800 [&_td]:p-2 [&_td]:text-zinc-300 [&_img]:rounded-lg [&_img]:mb-4 [&_img]:max-w-full"
        dangerouslySetInnerHTML={{ __html: html }}
      />
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
