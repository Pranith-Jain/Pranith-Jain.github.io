import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson, postJsonWithBody } from './adminApi';

interface PostEntry {
  slug: string;
  title: string;
  type: string;
  excerpt: string;
  publishedAt: string;
  tags: string[];
}

interface SocialContent {
  slug: string;
  twitter: string;
  linkedin: string;
  generatedAt: string;
}

interface SocialEntry {
  loadingTwitter: boolean;
  loadingLinkedin: boolean;
  data: SocialContent | null;
  error: string | null;
}

type SocialState = Record<string, SocialEntry>;

export default function PublishedTab() {
  const [posts, setPosts] = useState<PostEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [social, setSocial] = useState<SocialState>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Clear expanded so it can't reference a slug that no longer exists
    // after an unpublish/refresh.
    setExpanded(null);
    try {
      const d = await getJson<{ posts: PostEntry[] }>('/posts');
      setPosts(d.posts);
      const initial: SocialState = {};
      await Promise.all(
        d.posts.map(async (p) => {
          initial[p.slug] = { loadingTwitter: false, loadingLinkedin: false, data: null, error: null };
          try {
            const r = await getJson<{ ok: boolean; social: SocialContent }>(`/social/${encodeURIComponent(p.slug)}`);
            if (r.ok) initial[p.slug] = { loadingTwitter: false, loadingLinkedin: false, data: r.social, error: null };
          } catch {
            /* social data is optional */
          }
        })
      );
      setSocial(initial);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unpublish(slug: string) {
    // Destructive — match DraftsTab.reject's confirm UX.
    if (!window.confirm(`Unpublish /blog/${slug}? This removes the post from the site.`)) return;
    setActionMsg(null);
    try {
      await postJson(`/posts/${encodeURIComponent(slug)}/unpublish`);
      setActionMsg(`Unpublished /blog/${slug}`);
      await load();
    } catch (e) {
      setActionMsg(`unpublish failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function setSocialAndExpand(slug: string, update: Partial<SocialEntry>) {
    setSocial((prev) => {
      const next = { ...prev, [slug]: { ...prev[slug], ...update } as SocialEntry };
      return next;
    });
    setExpanded(slug);
  }

  async function generateTwitter(slug: string) {
    setSocial((prev) => ({ ...prev, [slug]: { ...prev[slug], loadingTwitter: true, error: null } }));
    try {
      const r = await postJsonWithBody<{
        ok: boolean;
        platform: string;
        content: string;
        generatedAt: string;
        error?: string;
      }>(`/social/${encodeURIComponent(slug)}/twitter`, {});
      if (r.ok) {
        setSocialAndExpand(slug, {
          loadingTwitter: false,
          error: null,
        });
        if (r.content) {
          setSocial((prev) => {
            const existing = prev[slug]?.data ?? { slug, twitter: '', linkedin: '', generatedAt: r.generatedAt };
            return {
              ...prev,
              [slug]: { ...prev[slug], data: { ...existing, twitter: r.content }, error: null },
            };
          });
        }
      } else {
        setSocialAndExpand(slug, { loadingTwitter: false, error: r.error ?? 'failed' });
      }
    } catch (e) {
      setSocialAndExpand(slug, { loadingTwitter: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  async function generateLinkedin(slug: string) {
    setSocial((prev) => ({ ...prev, [slug]: { ...prev[slug], loadingLinkedin: true, error: null } }));
    try {
      const r = await postJsonWithBody<{
        ok: boolean;
        platform: string;
        content: string;
        generatedAt: string;
        error?: string;
      }>(`/social/${encodeURIComponent(slug)}/linkedin`, {});
      if (r.ok) {
        setSocialAndExpand(slug, {
          loadingLinkedin: false,
          error: null,
        });
        if (r.content) {
          setSocial((prev) => {
            const existing = prev[slug]?.data ?? { slug, twitter: '', linkedin: '', generatedAt: r.generatedAt };
            return {
              ...prev,
              [slug]: { ...prev[slug], data: { ...existing, linkedin: r.content }, error: null },
            };
          });
        }
      } else {
        setSocialAndExpand(slug, { loadingLinkedin: false, error: r.error ?? 'failed' });
      }
    } catch (e) {
      setSocialAndExpand(slug, { loadingLinkedin: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;
  if (error)
    return (
      <div>
        <p className="text-red-400 mb-2">Failed to load: {error}</p>
        <button onClick={() => void load()} className="px-3 py-1 border border-slate-700 rounded text-sm">
          Retry
        </button>
      </div>
    );
  if (posts.length === 0)
    return (
      <div>
        {actionMsg && <p className="text-xs font-mono text-slate-400 mb-2">{actionMsg}</p>}
        <p className="text-slate-400">No published posts.</p>
      </div>
    );

  return (
    <div>
      {actionMsg && <p className="text-xs font-mono text-slate-400 mb-2">{actionMsg}</p>}
      <p className="text-xs text-slate-500 mb-4">Click a row to expand/collapse social content.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-800">
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
              <th scope="col" className="py-2 pr-4">
                Social
              </th>
              <th scope="col" className="py-2">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => {
              const s = social[p.slug];
              const hasTwitter = !!s?.data?.twitter;
              const hasLinkedin = !!s?.data?.linkedin;
              const hasAny = hasTwitter || hasLinkedin;
              const isExpanded = expanded === p.slug;
              return (
                <tr key={p.slug} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-4 text-slate-400 uppercase text-xs">{p.type}</td>
                  <td className="py-2 pr-4 text-slate-100">{p.title}</td>
                  <td className="py-2 pr-4 text-slate-500 text-xs whitespace-nowrap">
                    {new Date(p.publishedAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    <a
                      href={`/blog/${p.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-slate-300 hover:underline"
                    >
                      {p.slug}
                    </a>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => generateTwitter(p.slug)}
                        disabled={s?.loadingTwitter}
                        className={`px-2 py-1 border rounded text-xs disabled:opacity-50 ${hasTwitter ? 'border-slate-700 hover:bg-slate-800' : 'border-green-800 hover:bg-green-900/30'}`}
                      >
                        {s?.loadingTwitter ? '…' : hasTwitter ? 'Re-Tweet' : 'Tweet'}
                      </button>
                      <button
                        onClick={() => generateLinkedin(p.slug)}
                        disabled={s?.loadingLinkedin}
                        className={`px-2 py-1 border rounded text-xs disabled:opacity-50 ${hasLinkedin ? 'border-slate-700 hover:bg-slate-800' : 'border-blue-800 hover:bg-blue-900/30'}`}
                      >
                        {s?.loadingLinkedin ? '…' : hasLinkedin ? 'Re-LinkedIn' : 'LinkedIn'}
                      </button>
                      {hasAny && (
                        <button
                          onClick={() => setExpanded(isExpanded ? null : p.slug)}
                          className="px-2 py-1 border border-slate-700 rounded text-xs hover:bg-slate-800"
                        >
                          {isExpanded ? 'Hide' : 'View'}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-2 flex gap-2">
                    <button
                      onClick={() => unpublish(p.slug)}
                      className="px-2 py-1 border border-slate-700 rounded text-xs hover:bg-slate-800"
                    >
                      Unpublish
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expanded && social[expanded]?.data && (
        <SocialContentPanel
          data={social[expanded].data!}
          onCopy={copyText}
          onClose={() => setExpanded(null)}
          onRegenTwitter={() => generateTwitter(expanded)}
          onRegenLinkedin={() => generateLinkedin(expanded)}
          regenTwitterBusy={social[expanded]?.loadingTwitter ?? false}
          regenLinkedinBusy={social[expanded]?.loadingLinkedin ?? false}
        />
      )}

      {expanded && social[expanded]?.error && (
        <div className="mt-4 p-3 rounded bg-red-900/30 text-red-300 border border-red-800 text-sm">
          {social[expanded]?.error}
        </div>
      )}
    </div>
  );
}

function SocialContentPanel({
  data,
  onCopy,
  onClose,
  onRegenTwitter,
  onRegenLinkedin,
  regenTwitterBusy,
  regenLinkedinBusy,
}: {
  data: SocialContent;
  onCopy: (t: string) => void;
  onClose: () => void;
  onRegenTwitter: () => void;
  onRegenLinkedin: () => void;
  regenTwitterBusy: boolean;
  regenLinkedinBusy: boolean;
}) {
  const [copyMsg, setCopyMsg] = useState<'twitter' | 'linkedin' | null>(null);

  function copy(label: 'twitter' | 'linkedin') {
    onCopy(data[label]);
    setCopyMsg(label);
    setTimeout(() => setCopyMsg(null), 1500);
  }

  return (
    <div className="mt-6 rounded border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Social Content</h3>
        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300">
          Close
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">Generated {new Date(data.generatedAt).toLocaleString()}</p>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-400">Twitter Thread</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={onRegenTwitter}
              disabled={regenTwitterBusy}
              className="text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 disabled:opacity-50"
              title="Regenerate"
            >
              {regenTwitterBusy ? '…' : 'Regenerate'}
            </button>
            <button
              onClick={() => copy('twitter')}
              className="px-2 py-1 border border-slate-700 rounded text-xs hover:bg-slate-800"
            >
              {copyMsg === 'twitter' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <pre className="bg-slate-900 rounded p-3 text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
          {data.twitter}
        </pre>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-400">LinkedIn Post</h4>
          <div className="flex items-center gap-2">
            <button
              onClick={onRegenLinkedin}
              disabled={regenLinkedinBusy}
              className="text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 disabled:opacity-50"
              title="Regenerate"
            >
              {regenLinkedinBusy ? '…' : 'Regenerate'}
            </button>
            <button
              onClick={() => copy('linkedin')}
              className="px-2 py-1 border border-slate-700 rounded text-xs hover:bg-slate-800"
            >
              {copyMsg === 'linkedin' ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <pre className="bg-slate-900 rounded p-3 text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
          {data.linkedin}
        </pre>
      </div>
    </div>
  );
}
