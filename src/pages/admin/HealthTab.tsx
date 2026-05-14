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

export default function HealthTab() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const d = await getJson<Health>('/health');
      setHealth(d);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-zinc-400">Loading…</p>;
  if (error || !health)
    return (
      <div>
        <p className="text-red-400 mb-2">Failed to load</p>
        <button onClick={load} className="px-3 py-1 border border-zinc-700 rounded text-sm">
          Retry
        </button>
      </div>
    );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {CARDS.map((card) => (
        <div key={card.key} className="border border-zinc-800 rounded p-4 bg-zinc-900/40">
          <div className="text-xs uppercase tracking-wider text-zinc-500">{card.label}</div>
          <div className="text-2xl font-semibold text-zinc-100 mt-1 tabular-nums">{health[card.key]}</div>
        </div>
      ))}
    </div>
  );
}
