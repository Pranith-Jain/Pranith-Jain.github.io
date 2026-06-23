import { useCallback, useEffect, useState } from 'react';
import { getJson } from './adminApi';

interface Health {
  pendingCount: number;
  approvedCount: number;
  scheduleCount: number;
  failureCount: number;
  postsCount: number;
  approvalRequired?: boolean;
  secrets?: { groq?: boolean; vulncheck?: boolean };
}

const CARDS: Array<{
  key: 'pendingCount' | 'approvedCount' | 'scheduleCount' | 'failureCount' | 'postsCount';
  label: string;
}> = [
  { key: 'pendingCount', label: 'Pending' },
  { key: 'approvedCount', label: 'Approved' },
  { key: 'scheduleCount', label: 'Scheduled' },
  { key: 'failureCount', label: 'Failures' },
  { key: 'postsCount', label: 'Published' },
];

/** How often the health snapshot auto-refreshes while the tab is open. */
const AUTO_REFRESH_MS = 30_000;

export default function HealthTab() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getJson<Health>('/health');
      setHealth(d);
      setFetchedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Cards look stale unless they're refreshed periodically. 30s is fine
    // for KV-list counts — cheap on the worker side, and the admin tab
    // is rarely the foreground for long.
    const t = window.setInterval(() => void load(), AUTO_REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);

  if (loading && !health) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;
  if (error && !health)
    return (
      <div>
        <p className="text-rose-400 mb-2">Failed to load: {error}</p>
        <button
          onClick={() => void load()}
          className="px-3 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm"
        >
          Retry
        </button>
      </div>
    );

  if (!health) return null;

  // Badges the operator needs to see at a glance:
  //   - approval gate: if on, new posts land in drafts:<slug> instead of
  //     auto-publishing. Easy to mis-set on the worker and then wonder
  //     why nothing publishes.
  //   - missing secrets: a deploy that forgot GROQ_API_KEY will look like
  //     "publisher 429'd" hours later; this surfaces it immediately.
  const badges: Array<{ tone: 'ok' | 'warn' | 'err'; text: string }> = [];
  if (health.approvalRequired) {
    badges.push({ tone: 'warn', text: 'Approval gate ON — new posts queue in Drafts' });
  } else {
    badges.push({ tone: 'ok', text: 'Auto-publish ON' });
  }
  if (health.secrets) {
    if (!health.secrets.groq) {
      badges.push({ tone: 'err', text: 'GROQ_API_KEY missing — falls back to Workers AI' });
    } else {
      badges.push({ tone: 'ok', text: 'Groq key set' });
    }
    if (!health.secrets.vulncheck) {
      badges.push({ tone: 'warn', text: 'VULNCHECK_API_TOKEN missing — KEV runner no-ops' });
    } else {
      badges.push({ tone: 'ok', text: 'VulnCheck key set' });
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-mono text-slate-600 dark:text-slate-500">
          {fetchedAt ? `Updated ${fetchedAt.toLocaleTimeString()} · auto-refresh ${AUTO_REFRESH_MS / 1000}s` : ''}
          {error && ` · last refresh failed: ${error}`}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="px-2.5 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-xs hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {CARDS.map((card) => (
          <div
            key={card.key}
            className="border border-slate-200 dark:border-[rgb(var(--border-400))] rounded p-4 bg-slate-50 dark:bg-[rgb(var(--surface-200)/0.4)]"
          >
            <div className="text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500">{card.label}</div>
            <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mt-1 tabular-nums">
              {health[card.key]}
            </div>
          </div>
        ))}
      </div>
      {badges.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {badges.map((b, i) => (
            <span
              key={i}
              className={
                b.tone === 'ok'
                  ? 'px-2 py-1 rounded text-xs border border-emerald-700/50 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  : b.tone === 'warn'
                    ? 'px-2 py-1 rounded text-xs border border-amber-700/50 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                    : 'px-2 py-1 rounded text-xs border border-rose-700/50 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300'
              }
            >
              {b.text}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
