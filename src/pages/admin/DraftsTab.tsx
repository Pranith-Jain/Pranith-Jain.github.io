import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson } from './adminApi';

/**
 * Drafts queue — populated by the publisher when BLOG_APPROVAL_REQUIRED
 * is on. Each draft is a fully-generated post sitting in `drafts:<slug>`
 * awaiting an admin approve or reject. Approve copies the post to the
 * public index + refreshes RSS; reject deletes it. Neither path re-
 * triggers generation — the post body is final at this point.
 *
 * If the flag isn't set on the worker, the list will always be empty
 * (the publisher writes directly to `posts:` instead). The tab shows
 * a banner in that case so the admin isn't confused by an empty queue.
 */

interface DraftEntry {
  slug: string;
  title: string;
  type: string;
  excerpt: string;
  publishedAt: string;
  tags: string[];
}

interface DraftPreview {
  post: {
    slug: string;
    title: string;
    type: string;
    excerpt: string;
    publishedAt: string;
    body: string;
    tags: string[];
    iocs: Array<{ type: string; value: string }>;
    sources: Array<{ name: string; url: string }>;
    quality?: { total: number };
  };
  bodyHtml: string;
}

export default function DraftsTab() {
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  const [approvalRequired, setApprovalRequired] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DraftPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getJson<{ drafts: DraftEntry[]; approvalRequired: boolean }>('/drafts');
      setDrafts(d.drafts);
      setApprovalRequired(d.approvalRequired);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadPreview(slug: string) {
    setPreviewLoading(slug);
    setActionMsg(null);
    try {
      const p = await getJson<DraftPreview>(`/drafts/${encodeURIComponent(slug)}`);
      setPreview(p);
    } catch (e) {
      setActionMsg(`preview failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPreviewLoading(null);
    }
  }

  async function approve(slug: string) {
    if (!window.confirm(`Approve and publish "${slug}"? This will go live immediately.`)) return;
    setActionBusy(`approve:${slug}`);
    setActionMsg(null);
    try {
      const r = await postJson<{ ok: boolean; slug: string; approvedAt: string }>(
        `/drafts/${encodeURIComponent(slug)}/approve`
      );
      setActionMsg(`approved ${r.slug} → /blog/${r.slug}`);
      // Close preview if we just approved the one being previewed.
      if (preview?.post.slug === slug) setPreview(null);
      await load();
    } catch (e) {
      setActionMsg(`approve failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionBusy(null);
    }
  }

  async function reject(slug: string) {
    if (!window.confirm(`Reject and delete draft "${slug}"? This cannot be undone.`)) return;
    setActionBusy(`reject:${slug}`);
    setActionMsg(null);
    try {
      await postJson(`/drafts/${encodeURIComponent(slug)}/reject`);
      setActionMsg(`rejected ${slug}`);
      if (preview?.post.slug === slug) setPreview(null);
      await load();
    } catch (e) {
      setActionMsg(`reject failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setActionBusy(null);
    }
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

  return (
    <div>
      {/* Gate-mode banner — explains the tab's purpose differently
          depending on whether BLOG_APPROVAL_REQUIRED is on or off. */}
      {approvalRequired === false && (
        <div className="mb-4 rounded border border-amber-800 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
          <strong>Approval gate is OFF.</strong> The publisher is auto-publishing every post directly to /blog. To
          enable human review, set <code className="font-mono">BLOG_APPROVAL_REQUIRED=true</code> on the worker (
          <code className="font-mono">wrangler secret put BLOG_APPROVAL_REQUIRED</code>) and the next cron-triggered
          publish will land here instead.
        </div>
      )}
      {approvalRequired === true && (
        <div className="mb-4 rounded border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
          <strong>Approval gate is ON.</strong> New publisher runs write drafts here; nothing reaches /blog until you
          click Approve.
        </div>
      )}

      {actionMsg && (
        <div className="mb-4 rounded border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono text-slate-300">
          {actionMsg}
        </div>
      )}

      {drafts.length === 0 ? (
        <p className="text-slate-400">No drafts pending.</p>
      ) : (
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
                  Generated
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
              {drafts.map((d) => {
                const isPreviewing = preview?.post.slug === d.slug;
                const previewBusy = previewLoading === d.slug;
                const approveBusy = actionBusy === `approve:${d.slug}`;
                const rejectBusy = actionBusy === `reject:${d.slug}`;
                return (
                  <tr key={d.slug} className="border-b border-zinc-800/60 align-top">
                    <td className="py-2 pr-4 text-slate-400 uppercase text-xs">{d.type}</td>
                    <td className="py-2 pr-4 text-slate-100">{d.title}</td>
                    <td className="py-2 pr-4 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(d.publishedAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-400 break-all">{d.slug}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => (isPreviewing ? setPreview(null) : void loadPreview(d.slug))}
                          disabled={previewBusy}
                          className="px-2 py-1 border border-slate-700 rounded text-xs hover:bg-slate-800 disabled:opacity-50"
                        >
                          {previewBusy ? '…' : isPreviewing ? 'Hide' : 'Preview'}
                        </button>
                        <button
                          onClick={() => void approve(d.slug)}
                          disabled={approveBusy || rejectBusy}
                          className="px-2 py-1 border border-emerald-800 rounded text-xs text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-50"
                        >
                          {approveBusy ? '…' : 'Approve'}
                        </button>
                        <button
                          onClick={() => void reject(d.slug)}
                          disabled={approveBusy || rejectBusy}
                          className="px-2 py-1 border border-red-900 rounded text-xs text-red-300 hover:bg-red-900/30 disabled:opacity-50"
                        >
                          {rejectBusy ? '…' : 'Reject'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <DraftPreviewPanel
          preview={preview}
          onClose={() => setPreview(null)}
          onApprove={() => void approve(preview.post.slug)}
          onReject={() => void reject(preview.post.slug)}
          actionBusy={actionBusy}
        />
      )}
    </div>
  );
}

function DraftPreviewPanel({
  preview,
  onClose,
  onApprove,
  onReject,
  actionBusy,
}: {
  preview: DraftPreview;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  actionBusy: string | null;
}) {
  const { post, bodyHtml } = preview;
  const approveBusy = actionBusy === `approve:${post.slug}`;
  const rejectBusy = actionBusy === `reject:${post.slug}`;

  // Re-sanitize the server-rendered HTML in the browser before injecting it —
  // defense-in-depth matching the public BlogPost path, rather than trusting
  // the server regex sanitizer as the only layer. DOMPurify is loaded lazily
  // (no static isomorphic-dompurify import per the project lint rule).
  const [safeHtml, setSafeHtml] = useState('');
  useEffect(() => {
    let cancelled = false;
    void import('isomorphic-dompurify').then(({ default: DOMPurify }) => {
      if (!cancelled) {
        setSafeHtml(
          DOMPurify.sanitize(bodyHtml ?? '', {
            ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|#|\/):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
          })
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bodyHtml]);
  return (
    <div className="mt-6 rounded border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Preview</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            <span className="font-mono">{post.slug}</span> · type <span className="uppercase">{post.type}</span>
            {post.quality?.total !== undefined && <> · quality {post.quality.total}</>}
            {post.iocs.length > 0 && <> · {post.iocs.length} IOCs</>}
            {post.sources.length > 0 && <> · {post.sources.length} sources</>}
          </p>
        </div>
        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300">
          Close
        </button>
      </div>

      <h1 className="text-xl font-bold text-slate-100 mb-1">{post.title}</h1>
      <p className="text-sm text-slate-400 mb-4">{post.excerpt}</p>

      {/* Rendered preview — exactly what /blog/:slug would serve once
          approved. Inline styles cover the essentials (headings + links
          + code) without the Tailwind typography plugin, which isn't
          installed in this project. The container gets a contrasting
          dark background so visiting links / headings read cleanly. */}
      <div
        className={
          'mb-4 bg-zinc-950 border border-slate-800 rounded p-4 max-h-[60vh] overflow-y-auto text-sm leading-relaxed text-slate-300 ' +
          '[&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-slate-100 [&_h1]:mt-4 [&_h1]:mb-2 ' +
          '[&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-100 [&_h2]:mt-5 [&_h2]:mb-2 ' +
          '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-100 [&_h3]:mt-4 [&_h3]:mb-2 ' +
          '[&_p]:mb-3 ' +
          '[&_a]:text-blue-400 [&_a]:underline [&_a:hover]:text-blue-300 ' +
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 ' +
          '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 ' +
          '[&_li]:mb-1 ' +
          '[&_code]:font-mono [&_code]:text-[0.85em] [&_code]:bg-slate-900 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded ' +
          '[&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:mb-3 ' +
          '[&_strong]:text-slate-100 [&_strong]:font-semibold ' +
          '[&_blockquote]:border-l-2 [&_blockquote]:border-slate-700 [&_blockquote]:pl-3 [&_blockquote]:text-slate-400 [&_blockquote]:my-3'
        }
        // Server runs renderMarkdown → DOMPurify, and we re-sanitize here too
        // (see safeHtml above) so the admin preview matches the public path.
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onApprove}
          disabled={approveBusy || rejectBusy}
          className="px-3 py-1.5 border border-emerald-700 rounded text-sm text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-50"
        >
          {approveBusy ? 'Approving…' : 'Approve & publish'}
        </button>
        <button
          onClick={onReject}
          disabled={approveBusy || rejectBusy}
          className="px-3 py-1.5 border border-red-900 rounded text-sm text-red-300 hover:bg-red-900/30 disabled:opacity-50"
        >
          {rejectBusy ? 'Rejecting…' : 'Reject & delete'}
        </button>
      </div>
    </div>
  );
}
