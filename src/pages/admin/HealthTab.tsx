import { useCallback, useEffect, useState } from 'react';
import { getJson } from './adminApi';

interface Health {
  pendingCount: number;
  approvedCount: number;
  scheduleCount: number;
  failureCount: number;
  postsCount: number;
}

const CARDS: Array<{ key: keyof Health; label: string }> = [
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

  if (loading && !health) return <p className="text-slate-400">Loading…</p>;
  if (error && !health)
    return (
      <div>
        <p className="text-red-400 mb-2">Failed to load: {error}</p>
        <button onClick={() => void load()} className="px-3 py-1 border border-slate-700 rounded text-sm">
          Retry
        </button>
      </div>
    );

  if (!health) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-mono text-slate-500">
          {fetchedAt ? `Updated ${fetchedAt.toLocaleTimeString()} · auto-refresh ${AUTO_REFRESH_MS / 1000}s` : ''}
          {error && ` · last refresh failed: ${error}`}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="px-2.5 py-1 border border-slate-700 rounded text-xs hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {CARDS.map((card) => (
          <div key={card.key} className="border border-slate-800 rounded p-4 bg-zinc-900/40">
            <div className="text-xs uppercase tracking-wider text-slate-500">{card.label}</div>
            <div className="text-2xl font-semibold text-slate-100 mt-1 tabular-nums">{health[card.key]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
