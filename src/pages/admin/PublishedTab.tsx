import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, getObjectUrl, postJson, postJsonWithBody } from './adminApi';
import { bestTimeHint, type SocialPlatform } from './socialHints';
import { splitSocial } from '../../lib/social-parts';

interface ScheduleEntry {
  scheduledAt?: string;
  status: 'pending' | 'posted' | 'scheduled';
  postedAt?: string;
}
interface SocialScheduleData {
  slug: string;
  twitter?: ScheduleEntry;
  linkedin?: ScheduleEntry;
  instagram?: ScheduleEntry;
  updatedAt: string;
}

function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface PostEntry {
  slug: string;
  title: string;
  type: string;
  excerpt: string;
  publishedAt: string;
  tags: string[];
}

interface CarouselSlide {
  index: number;
  headline: string;
  body?: string;
  bullets?: string[];
  kind?: string;
}

interface SocialContent {
  slug: string;
  twitter: string;
  linkedin: string;
  instagram?: string;
  carousel?: { format: 'instagram'; slides: CarouselSlide[] };
  generatedAt: string;
}

interface SocialEntry {
  loadingTwitter: boolean;
  loadingLinkedin: boolean;
  data: SocialContent | null;
  error: string | null;
  // Per-platform presence from the cheap /social-index list, so button state
  // doesn't need the full per-post /social fetch on load.
  hasTwitter: boolean;
  hasLinkedin: boolean;
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
      // ONE /social-index list call instead of a /social fetch per post (each
      // of which read 3 KV keys). Full content is fetched lazily on expand.
      let idx: Record<string, { twitter: boolean; linkedin: boolean }> = {};
      try {
        idx = (await getJson<{ index: Record<string, { twitter: boolean; linkedin: boolean }> }>('/social-index'))
          .index;
      } catch {
        /* index is optional */
      }
      const initial: SocialState = {};
      for (const p of d.posts) {
        initial[p.slug] = {
          loadingTwitter: false,
          loadingLinkedin: false,
          data: null,
          error: null,
          hasTwitter: idx[p.slug]?.twitter ?? false,
          hasLinkedin: idx[p.slug]?.linkedin ?? false,
        };
      }
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

  // Lazy-load the full social content the first time a row is expanded (the
  // list view only knows per-platform presence, not the copy itself).
  async function viewSocial(slug: string) {
    if (expanded === slug) {
      setExpanded(null);
      return;
    }
    if (!social[slug]?.data) {
      try {
        const r = await getJson<{ ok: boolean; social: SocialContent }>(`/social/${encodeURIComponent(slug)}`);
        if (r.ok) setSocial((prev) => ({ ...prev, [slug]: { ...prev[slug], data: r.social } as SocialEntry }));
      } catch {
        /* social content is optional */
      }
    }
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
              [slug]: { ...prev[slug], data: { ...existing, twitter: r.content }, error: null, hasTwitter: true },
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
              [slug]: { ...prev[slug], data: { ...existing, linkedin: r.content }, error: null, hasLinkedin: true },
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

  if (loading) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;
  if (error)
    return (
      <div>
        <p className="text-rose-600 dark:text-rose-400 mb-2">Failed to load: {error}</p>
        <button
          onClick={() => void load()}
          className="px-3 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm"
        >
          Retry
        </button>
      </div>
    );
  if (posts.length === 0)
    return (
      <div>
        {actionMsg && <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-2">{actionMsg}</p>}
        <p className="text-slate-500 dark:text-slate-400">No published posts.</p>
      </div>
    );

  return (
    <div>
      {actionMsg && <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-2">{actionMsg}</p>}
      <p className="text-xs text-slate-600 dark:text-slate-500 mb-4">Click a row to expand/collapse social content.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
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
              const hasTwitter = !!s?.hasTwitter;
              const hasLinkedin = !!s?.hasLinkedin;
              const hasAny = hasTwitter || hasLinkedin;
              const isExpanded = expanded === p.slug;
              return (
                <tr key={p.slug} className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                  <td className="py-2 pr-4 text-slate-500 dark:text-slate-400 uppercase text-xs">{p.type}</td>
                  <td className="py-2 pr-4 text-slate-900 dark:text-slate-100">{p.title}</td>
                  <td className="py-2 pr-4 text-slate-600 dark:text-slate-500 text-xs whitespace-nowrap">
                    {new Date(p.publishedAt).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    <a
                      href={`/blog/${p.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-slate-700 dark:text-slate-300 hover:underline"
                    >
                      {p.slug}
                    </a>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => generateTwitter(p.slug)}
                        disabled={s?.loadingTwitter}
                        className={`px-2 py-1 border rounded text-xs disabled:opacity-50 ${hasTwitter ? 'border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]' : 'border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'}`}
                      >
                        {s?.loadingTwitter ? '…' : hasTwitter ? 'Re-Tweet' : 'Tweet'}
                      </button>
                      <button
                        onClick={() => generateLinkedin(p.slug)}
                        disabled={s?.loadingLinkedin}
                        className={`px-2 py-1 border rounded text-xs disabled:opacity-50 ${hasLinkedin ? 'border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]' : 'border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/30'}`}
                      >
                        {s?.loadingLinkedin ? '…' : hasLinkedin ? 'Re-LinkedIn' : 'LinkedIn'}
                      </button>
                      {hasAny && (
                        <button
                          onClick={() => void viewSocial(p.slug)}
                          className="px-2 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-xs hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
                        >
                          {isExpanded ? 'Hide' : 'View'}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-2 flex gap-2">
                    <button
                      onClick={() => unpublish(p.slug)}
                      className="px-2 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-xs hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
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
          onClose={() => setExpanded(null)}
          onRegenTwitter={() => generateTwitter(expanded)}
          onRegenLinkedin={() => generateLinkedin(expanded)}
          regenTwitterBusy={social[expanded]?.loadingTwitter ?? false}
          regenLinkedinBusy={social[expanded]?.loadingLinkedin ?? false}
        />
      )}

      {expanded && social[expanded]?.error && (
        <div className="mt-4 p-3 rounded bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-sm">
          {social[expanded]?.error}
        </div>
      )}
    </div>
  );
}

type PostState = {
  posting: boolean;
  result: { ok: boolean; postUrl?: string; error?: string } | null;
};

function SocialContentPanel({
  data,
  onClose,
  onRegenTwitter,
  onRegenLinkedin,
  regenTwitterBusy,
  regenLinkedinBusy,
}: {
  data: SocialContent;
  onClose: () => void;
  onRegenTwitter: () => void;
  onRegenLinkedin: () => void;
  regenTwitterBusy: boolean;
  regenLinkedinBusy: boolean;
}) {
  const [postState, setPostState] = useState<{ twitter: PostState; linkedin: PostState }>({
    twitter: { posting: false, result: null },
    linkedin: { posting: false, result: null },
  });
  const [schedRefresh, setSchedRefresh] = useState(0);

  async function postToPlatform(slug: string, platform: 'twitter' | 'linkedin') {
    setPostState((prev) => ({
      ...prev,
      [platform]: { posting: true, result: null },
    }));
    try {
      const r = await postJson<{ ok: boolean; postUrl?: string; error?: string }>(
        `/social/${encodeURIComponent(slug)}/post-${platform}`
      );
      setPostState((prev) => ({
        ...prev,
        [platform]: { posting: false, result: r },
      }));
      setSchedRefresh((n) => n + 1);
    } catch (e) {
      setPostState((prev) => ({
        ...prev,
        [platform]: { posting: false, result: { ok: false, error: e instanceof Error ? e.message : String(e) } },
      }));
    }
  }

  return (
    <div className="mt-6 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Social Content
        </h3>
        <button
          onClick={onClose}
          className="text-xs text-slate-600 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        >
          Close
        </button>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-500 mb-4">
        Generated {new Date(data.generatedAt).toLocaleString()}
      </p>

      <SchedulePanel slug={data.slug} refreshTrigger={schedRefresh} />

      <SocialSection
        heading="Twitter Thread"
        text={data.twitter}
        onRegen={onRegenTwitter}
        regenBusy={regenTwitterBusy}
        onPost={() => postToPlatform(data.slug, 'twitter')}
        postingBusy={postState.twitter.posting}
        postResult={postState.twitter.result}
        postLabel="Post to X"
      />
      <SocialSection
        heading="LinkedIn Post"
        text={data.linkedin}
        onRegen={onRegenLinkedin}
        regenBusy={regenLinkedinBusy}
        onPost={() => postToPlatform(data.slug, 'linkedin')}
        postingBusy={postState.linkedin.posting}
        postResult={postState.linkedin.result}
        postLabel="Post to LinkedIn"
        tight
      />

      {data.instagram && <InstagramSection slug={data.slug} caption={data.instagram} carousel={data.carousel} />}
    </div>
  );
}

/** Instagram caption + carousel preview + download + mark-posted. */
function InstagramSection({
  slug,
  caption,
  carousel,
}: {
  slug: string;
  caption: string;
  carousel?: SocialContent['carousel'];
}) {
  const [copied, setCopied] = useState(false);
  // objectUrls[i] is either undefined (not yet fetched), null (loading), or a
  // blob URL string (ready).
  const [objectUrls, setObjectUrls] = useState<(string | null | undefined)[]>([]);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  // Track blob URLs created so we can revoke them on unmount.
  const urlsRef = useRef<string[]>([]);

  const slides = carousel?.slides ?? [];
  const total = slides.length;

  // Fetch all slide PNGs as blob URLs when this component mounts (or when
  // the slide count changes). Revoke previous URLs first.
  useEffect(() => {
    if (total === 0) return;

    // Initialise slots to null (loading).
    setObjectUrls(Array<null>(total).fill(null));
    setFetchErr(null);

    // Revoke any previously held URLs.
    for (const u of urlsRef.current) URL.revokeObjectURL(u);
    urlsRef.current = [];

    let cancelled = false;

    async function fetchAll() {
      const results: (string | null)[] = Array<null>(total).fill(null);
      for (let i = 0; i < total; i++) {
        if (cancelled) break;
        try {
          const url = await getObjectUrl(`/social/carousel/${encodeURIComponent(slug)}/${i}.png`);
          if (!cancelled) {
            urlsRef.current.push(url);
            results[i] = url;
            setObjectUrls([...results]);
          }
        } catch (e) {
          if (!cancelled) {
            setFetchErr(e instanceof Error ? e.message : String(e));
          }
        }
      }
    }

    void fetchAll();

    return () => {
      cancelled = true;
      for (const u of urlsRef.current) URL.revokeObjectURL(u);
      urlsRef.current = [];
    };
  }, [slug, total]);

  function copyCaption() {
    navigator.clipboard.writeText(caption).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadAll() {
    setDownloading(true);
    for (let i = 0; i < total; i++) {
      const url = objectUrls[i];
      if (!url) continue;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}-ig-${i + 1}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setDownloading(false);
  }

  return (
    <div className="mb-6 last:mb-0">
      {/* Section heading */}
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-pink-600 dark:text-pink-400">Instagram</h4>
      </div>

      {/* Caption */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-micro uppercase tracking-wider text-slate-600 dark:text-slate-500">Caption</span>
          <button
            onClick={copyCaption}
            className="px-2 py-0.5 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-xs hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
          >
            {copied ? 'Copied!' : 'Copy caption'}
          </button>
        </div>
        <textarea
          readOnly
          value={caption}
          rows={5}
          className="w-full bg-white dark:bg-[rgb(var(--surface-200))] rounded p-3 text-xs text-slate-700 dark:text-slate-300 font-mono leading-relaxed border border-slate-200 dark:border-[rgb(var(--border-400))] resize-none focus:outline-none"
          aria-label="Instagram caption"
        />
      </div>

      {/* Carousel preview */}
      {total > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-micro uppercase tracking-wider text-slate-600 dark:text-slate-500">
              Carousel slides ({total})
            </span>
            <button
              onClick={downloadAll}
              disabled={downloading || objectUrls.every((u) => !u)}
              className="px-2 py-0.5 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-xs hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] disabled:opacity-50"
            >
              {downloading ? '…' : 'Download all'}
            </button>
          </div>

          {fetchErr && <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">Slide load error: {fetchErr}</p>}

          <div
            className="flex gap-3 overflow-x-auto pb-2"
            role="list"
            aria-label={`Instagram carousel slides for ${slug}`}
          >
            {slides.map((slide, i) => {
              const url = objectUrls[i];
              return (
                <div key={i} role="listitem" className="flex-shrink-0 flex flex-col items-center gap-1">
                  {url ? (
                    <img
                      src={url}
                      alt={`Carousel slide ${i + 1} of ${total}: ${slide.headline}`}
                      className="w-40 h-40 object-cover rounded border border-slate-200 dark:border-[rgb(var(--border-400))]"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="w-40 h-40 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-100 dark:bg-[rgb(var(--surface-200))] flex items-center justify-center"
                      aria-label={`Loading slide ${i + 1} of ${total}`}
                    >
                      <span className="text-xs text-slate-400 dark:text-slate-500">{url === null ? '…' : 'err'}</span>
                    </div>
                  )}
                  <span className="text-micro text-slate-500 dark:text-slate-400">
                    {i + 1}/{total}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mark-posted row — reuses the same SchedulePanel which now includes instagram */}
      {/* (SchedulePanel already renders the instagram row via SocialPlatform union) */}
    </div>
  );
}

/** One platform's generated copy, with the link + carousel blocks split out so
 *  each can be copied separately — the link must go in the first comment/reply,
 *  not the post body, so you never paste it into the post itself. */
function SocialSection({
  heading,
  text,
  onRegen,
  regenBusy,
  tight,
  onPost,
  postingBusy,
  postResult,
  postLabel,
}: {
  heading: string;
  text: string;
  onRegen: () => void;
  regenBusy: boolean;
  /** Tighter line-height for paragraph-shaped copy (LinkedIn). Twitter
   *  threads are line-shaped and keep the looser height. */
  tight?: boolean;
  onPost?: () => void;
  postingBusy?: boolean;
  postResult?: { ok: boolean; postUrl?: string; error?: string } | null;
  postLabel?: string;
}) {
  const parts = splitSocial(text);
  const [copied, setCopied] = useState<string | null>(null);
  function copy(key: string, value: string) {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }
  return (
    <div className="mb-6 last:mb-0">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">{heading}</h4>
        <div className="flex items-center gap-2">
          {onPost && (
            <button
              onClick={onPost}
              disabled={postingBusy}
              className="px-2 py-1 border border-emerald-200 dark:border-emerald-700 rounded text-xs hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-50"
              title={postLabel}
            >
              {postingBusy ? '…' : (postLabel ?? 'Post')}
            </button>
          )}
          <button
            onClick={onRegen}
            disabled={regenBusy}
            className="text-micro uppercase tracking-wider text-slate-600 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-50"
            title="Regenerate"
          >
            {regenBusy ? '…' : 'Regenerate'}
          </button>
          <button
            onClick={() => copy('body', parts.body)}
            className="px-2 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-xs hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
          >
            {copied === 'body' ? 'Copied!' : 'Copy post'}
          </button>
        </div>
      </div>
      <pre
        className={`bg-white dark:bg-[rgb(var(--surface-200))] rounded p-3 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono ${
          tight ? 'leading-normal' : 'leading-relaxed'
        } max-h-80 overflow-y-auto`}
      >
        {parts.body}
      </pre>
      {parts.link && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-600 dark:text-slate-500">{parts.link.label}:</span>
          <span className="font-mono text-slate-700 dark:text-slate-300 break-all">{parts.link.value}</span>
          <button
            onClick={() => copy('link', parts.link!.value)}
            className="px-2 py-0.5 border border-sky-200 dark:border-sky-700 rounded hover:bg-sky-50 dark:hover:bg-sky-900/30"
          >
            {copied === 'link' ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      )}
      {parts.carousel && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-micro uppercase tracking-wider text-slate-600 dark:text-slate-500">
              Carousel outline
            </span>
            <button
              onClick={() => copy('carousel', parts.carousel!)}
              className="px-2 py-0.5 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-xs hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
            >
              {copied === 'carousel' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="bg-white dark:bg-[rgb(var(--surface-200))] rounded p-2 text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
            {parts.carousel}
          </pre>
        </div>
      )}

      {postResult && (
        <div
          className={`mt-2 text-xs ${postResult.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
        >
          {postResult.ok
            ? `Posted! ${postResult.postUrl ? `(${postResult.postUrl})` : ''}`
            : `Post failed: ${postResult.error ?? 'unknown error'}`}
        </div>
      )}
    </div>
  );
}

/** Manual-posting queue for one post: per-platform status, a planned time,
 *  and a best-time hint. Posting itself stays manual (copy → paste). */
function SchedulePanel({ slug, refreshTrigger = 0 }: { slug: string; refreshTrigger?: number }) {
  const [sched, setSched] = useState<SocialScheduleData | null>(null);
  const [busy, setBusy] = useState<SocialPlatform | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadSched = useCallback(async () => {
    try {
      const r = await getJson<{ schedule: SocialScheduleData | null }>(`/social-schedule/${encodeURIComponent(slug)}`);
      setSched(r.schedule);
    } catch {
      /* schedule is optional */
    }
  }, [slug]);

  useEffect(() => {
    void loadSched();
  }, [loadSched, refreshTrigger]);

  async function saveTime(platform: SocialPlatform, localValue: string) {
    setBusy(platform);
    setMsg(null);
    try {
      const scheduledAt = localValue ? new Date(localValue).toISOString() : '';
      const r = await postJsonWithBody<{ ok: boolean; schedule: SocialScheduleData }>(
        `/social-schedule/${encodeURIComponent(slug)}/${platform}`,
        { scheduledAt }
      );
      setSched(r.schedule);
      setMsg(localValue ? `${platform} time saved` : `${platform} time cleared`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function togglePosted(platform: SocialPlatform, current: 'pending' | 'posted' | 'scheduled') {
    setBusy(platform);
    setMsg(null);
    try {
      const r =
        current === 'posted'
          ? await postJsonWithBody<{ ok: boolean; schedule: SocialScheduleData }>(
              `/social-schedule/${encodeURIComponent(slug)}/${platform}`,
              { status: 'pending' }
            )
          : await postJson<{ ok: boolean; schedule: SocialScheduleData }>(
              `/social-schedule/${encodeURIComponent(slug)}/${platform}/mark-posted`
            );
      setSched(r.schedule);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const rows: SocialPlatform[] = ['twitter', 'linkedin', 'instagram'];

  return (
    <div className="mb-6 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200)/0.4)] p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-mini font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Posting queue
        </h4>
        {msg && <span className="text-micro text-slate-600 dark:text-slate-500">{msg}</span>}
      </div>
      <div className="space-y-3">
        {rows.map((platform) => {
          const entry = sched?.[platform];
          const status = entry?.status ?? 'pending';
          const overdue =
            status === 'pending' && entry?.scheduledAt ? new Date(entry.scheduledAt).getTime() < Date.now() : false;
          return (
            <div key={platform} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="w-16 uppercase text-slate-500 dark:text-slate-400">{platform}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-micro ${
                  status === 'posted'
                    ? 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50'
                    : status === 'scheduled'
                      ? 'bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-700/50'
                      : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700/40'
                }`}
              >
                {status}
                {entry?.postedAt ? ` ${new Date(entry.postedAt).toLocaleDateString()}` : ''}
              </span>
              {overdue && (
                <span className="px-1.5 py-0.5 rounded text-micro bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-700/50">
                  overdue
                </span>
              )}
              <input
                type="datetime-local"
                defaultValue={toLocalInput(entry?.scheduledAt)}
                onBlur={(e) => void saveTime(platform, e.target.value)}
                disabled={busy === platform}
                className="bg-white dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded px-1.5 py-0.5 text-slate-700 dark:text-slate-300 disabled:opacity-50"
                title="Planned post time (saved on blur)"
              />
              <button
                onClick={() => void togglePosted(platform, status)}
                disabled={busy === platform}
                className="px-2 py-0.5 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] disabled:opacity-50"
              >
                {status === 'posted' ? 'Mark pending' : 'Mark posted'}
              </button>
              <span className="text-micro text-slate-600 dark:text-slate-500">
                {platform !== 'instagram'
                  ? bestTimeHint(platform)
                  : 'Best: Mon–Fri, 11am–1pm or 7–9pm (audience local).'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
