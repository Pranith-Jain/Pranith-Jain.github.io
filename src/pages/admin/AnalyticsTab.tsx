import { useCallback, useEffect, useState } from 'react';
import { getSocialAnalytics, saveSocialMetrics } from './adminApi';
import type {
  SocialAnalyticsPost,
  SocialAnalyticsByType,
  SocialAnalyticsResponse,
  SocialPostMetrics,
} from './adminApi';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Simple bar as a CSS-width div. `value` is already the max in the set. */
function EngagementBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div
      className="h-2 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] overflow-hidden"
      style={{ width: '4rem' }}
      aria-hidden="true"
    >
      <div className="h-full bg-brand-500 dark:bg-brand-400 rounded" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Manual-metrics form ─────────────────────────────────────────────────────

interface MetricsFormState {
  slug: string;
  platform: 'twitter' | 'linkedin' | 'instagram';
  impressions: string;
  likes: string;
  reposts: string;
  replies: string;
  clicks: string;
  postUrl: string;
}

const BLANK_FORM: MetricsFormState = {
  slug: '',
  platform: 'linkedin',
  impressions: '',
  likes: '',
  reposts: '',
  replies: '',
  clicks: '',
  postUrl: '',
};

function parseOptInt(s: string): number | undefined {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function MetricsForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState<MetricsFormState>(BLANK_FORM);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function set(field: keyof MetricsFormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.slug.trim()) {
      setMsg('Slug is required.');
      return;
    }
    setBusy(true);
    setMsg(null);
    const metrics: SocialPostMetrics & { postUrl?: string } = {
      impressions: parseOptInt(form.impressions),
      likes: parseOptInt(form.likes),
      reposts: parseOptInt(form.reposts),
      replies: parseOptInt(form.replies),
      clicks: parseOptInt(form.clicks),
      postUrl: form.postUrl.trim() || undefined,
    };
    try {
      await saveSocialMetrics(form.slug.trim(), form.platform, metrics);
      setMsg('Saved.');
      setForm(BLANK_FORM);
      onSaved();
    } catch (err) {
      setMsg(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    'w-28 px-2 py-1 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm text-slate-900 dark:text-slate-100 disabled:opacity-50';

  return (
    <section
      aria-labelledby="manual-metrics-heading"
      className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-4"
    >
      <h2
        id="manual-metrics-heading"
        className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3"
      >
        Add / update metrics manually
      </h2>
      <p className="text-xs text-slate-600 dark:text-slate-500 mb-4">
        For LinkedIn and Instagram: read the numbers off the platform and enter them here. Twitter is auto-refreshed by
        the cron.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Slug */}
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1">Slug</span>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value)}
              placeholder="my-case-study"
              disabled={busy}
              aria-label="Post slug"
              required
              className="w-44 px-2 py-1 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm text-slate-900 dark:text-slate-100 disabled:opacity-50"
            />
          </label>

          {/* Platform */}
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1">
              Platform
            </span>
            <select
              value={form.platform}
              onChange={(e) => set('platform', e.target.value as MetricsFormState['platform'])}
              disabled={busy}
              aria-label="Platform"
              className="px-2 py-1 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm text-slate-900 dark:text-slate-100 disabled:opacity-50"
            >
              <option value="linkedin">LinkedIn</option>
              <option value="instagram">Instagram</option>
              <option value="twitter">Twitter / X</option>
            </select>
          </label>
        </div>

        {/* Metrics numbers */}
        <div className="flex flex-wrap gap-3 items-end">
          {(
            [
              { field: 'impressions', label: 'Impressions' },
              { field: 'likes', label: 'Likes' },
              { field: 'reposts', label: 'Reposts' },
              { field: 'replies', label: 'Replies' },
              { field: 'clicks', label: 'Clicks' },
            ] as Array<{ field: keyof MetricsFormState; label: string }>
          ).map(({ field, label }) => (
            <label key={field} className="block">
              <span className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1">
                {label}
              </span>
              <input
                type="number"
                min={0}
                value={form[field]}
                onChange={(e) => set(field, e.target.value)}
                disabled={busy}
                aria-label={label}
                className={inputCls}
              />
            </label>
          ))}
        </div>

        {/* Post URL */}
        <label className="block">
          <span className="block text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 mb-1">
            Post URL (optional)
          </span>
          <input
            type="url"
            value={form.postUrl}
            onChange={(e) => set('postUrl', e.target.value)}
            placeholder="https://www.linkedin.com/posts/…"
            disabled={busy}
            aria-label="Post URL"
            className="w-full max-w-sm px-2 py-1 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm text-slate-900 dark:text-slate-100 disabled:opacity-50"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-1.5 border border-slate-300 dark:border-slate-600 rounded text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] hover:text-slate-900 dark:hover:text-white disabled:opacity-50 transition-colors"
          >
            {busy ? 'Saving…' : 'Save metrics'}
          </button>
          {msg && (
            <span className="text-xs font-mono text-slate-600 dark:text-slate-400" role="status">
              {msg}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

// ─── By-type summary table ────────────────────────────────────────────────────

function ByTypeTable({ rows }: { rows: SocialAnalyticsByType[] }) {
  const maxAvg = Math.max(...rows.map((r) => r.avgEngagement), 1);

  return (
    <section aria-labelledby="by-type-heading">
      <h2
        id="by-type-heading"
        className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3"
      >
        What performs — by content type
      </h2>
      <div className="overflow-x-auto rounded border border-slate-200 dark:border-[rgb(var(--border-400))]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200)/0.5)]">
            <tr>
              <th scope="col" className="px-3 py-2 pr-4">
                Type
              </th>
              <th scope="col" className="px-3 py-2 pr-4 text-right">
                Posts
              </th>
              <th scope="col" className="px-3 py-2 pr-4 text-right">
                Avg engagement
              </th>
              <th scope="col" className="px-3 py-2 pr-4 text-right">
                Total engagement
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Total impressions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.type}
                className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-200)/0.4)]"
              >
                <td className="px-3 py-2 pr-4 font-mono text-xs uppercase text-slate-700 dark:text-slate-300">
                  {row.type}
                </td>
                <td className="px-3 py-2 pr-4 text-right text-slate-600 dark:text-slate-400">{row.posts}</td>
                <td className="px-3 py-2 pr-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <EngagementBar value={row.avgEngagement} max={maxAvg} />
                    <span className="text-slate-900 dark:text-slate-100 tabular-nums">
                      {row.avgEngagement.toFixed(1)}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 pr-4 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {row.totalEngagement.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {fmtNum(row.totalImpressions)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Per-post table ───────────────────────────────────────────────────────────

function PostsTable({ posts }: { posts: SocialAnalyticsPost[] }) {
  return (
    <section aria-labelledby="posts-heading">
      <h2
        id="posts-heading"
        className="text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3"
      >
        Per-post breakdown
      </h2>
      <div className="overflow-x-auto rounded border border-slate-200 dark:border-[rgb(var(--border-400))]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200)/0.5)]">
            <tr>
              <th scope="col" className="px-3 py-2 pr-4">
                Slug
              </th>
              <th scope="col" className="px-3 py-2 pr-4">
                Platform
              </th>
              <th scope="col" className="px-3 py-2 pr-4 text-right">
                Engagement
              </th>
              <th scope="col" className="px-3 py-2 pr-4 text-right">
                Likes
              </th>
              <th scope="col" className="px-3 py-2 pr-4 text-right">
                Reposts
              </th>
              <th scope="col" className="px-3 py-2 pr-4 text-right">
                Replies
              </th>
              <th scope="col" className="px-3 py-2 pr-4 text-right">
                Impressions
              </th>
              <th scope="col" className="px-3 py-2 pr-4">
                Post link
              </th>
              <th scope="col" className="px-3 py-2">
                Fetched
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p, i) => (
              <tr
                key={`${p.slug}-${p.platform}-${i}`}
                className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-200)/0.4)]"
              >
                <td className="px-3 py-2 pr-4">
                  <a
                    href={`/blog/${p.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-slate-700 dark:text-slate-300 hover:underline"
                    aria-label={`Open blog post ${p.slug}`}
                  >
                    {p.slug}
                  </a>
                </td>
                <td className="px-3 py-2 pr-4 text-xs uppercase text-slate-500 dark:text-slate-400">{p.platform}</td>
                <td className="px-3 py-2 pr-4 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                  {p.engagement.toLocaleString()}
                </td>
                <td className="px-3 py-2 pr-4 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {fmtNum(p.metrics.likes)}
                </td>
                <td className="px-3 py-2 pr-4 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {fmtNum(p.metrics.reposts)}
                </td>
                <td className="px-3 py-2 pr-4 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {fmtNum(p.metrics.replies)}
                </td>
                <td className="px-3 py-2 pr-4 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {fmtNum(p.metrics.impressions)}
                </td>
                <td className="px-3 py-2 pr-4">
                  {p.postUrl ? (
                    <a
                      href={p.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-600 dark:text-slate-400 hover:underline"
                      aria-label={`View ${p.platform} post for ${p.slug}`}
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {fmtDate(p.fetchedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Main AnalyticsTab ────────────────────────────────────────────────────────

export default function AnalyticsTab() {
  const [data, setData] = useState<SocialAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getSocialAnalytics();
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;

  if (error && !data)
    return (
      <div>
        <p className="text-rose-600 dark:text-rose-400 mb-2" role="alert">
          Failed to load: {error}
        </p>
        <button
          onClick={() => void load()}
          className="px-3 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm"
        >
          Retry
        </button>
      </div>
    );

  const hasPosts = (data?.posts.length ?? 0) > 0;
  const hasByType = (data?.byType.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* Empty state */}
      {!hasPosts && (
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          No engagement data yet — auto-refreshes hourly for posted tweets; add LinkedIn/Instagram numbers manually
          using the form below.
        </p>
      )}

      {/* By-type table */}
      {hasByType && <ByTypeTable rows={data!.byType} />}

      {/* Per-post table */}
      {hasPosts && <PostsTable posts={data!.posts} />}

      {/* Manual entry form — always visible so operator can add numbers any time */}
      <MetricsForm onSaved={() => void load()} />
    </div>
  );
}
