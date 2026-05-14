import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson } from './adminApi';

interface Candidate {
  key: string;
  type: 'cve' | 'actor' | 'malware' | 'ransom';
  title: string;
  rationale: string;
  score: number;
  evidence: Record<string, unknown>;
  discoveredAt: string;
  status: string;
}

export default function PendingTab() {
  const [pending, setPending] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const d = await getJson<{ pending: Candidate[] }>('/candidates');
      setPending(d.pending);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string) {
    try {
      await postJson(`/candidates/${encodeURIComponent(id)}/approve`);
      await load();
    } catch {
      setError(true);
    }
  }

  async function skip(id: string, type: string) {
    try {
      await postJson(`/candidates/${encodeURIComponent(id)}/skip?type=${type}`);
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
  if (pending.length === 0) return <p className="text-zinc-400">No pending candidates.</p>;

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
        <tr>
          <th className="py-2 pr-4">Type</th>
          <th className="py-2 pr-4">Title</th>
          <th className="py-2 pr-4">Score</th>
          <th className="py-2 pr-4">Rationale</th>
          <th className="py-2 pr-4">Discovered</th>
          <th className="py-2">Actions</th>
        </tr>
      </thead>
      <tbody>
        {pending.map((c) => (
          <tr key={c.key} className="border-b border-zinc-800/60 align-top">
            <td className="py-2 pr-4 text-zinc-400 uppercase text-xs">{c.type}</td>
            <td className="py-2 pr-4 text-zinc-100">{c.title}</td>
            <td className="py-2 pr-4 text-zinc-300 tabular-nums">{c.score.toFixed(2)}</td>
            <td className="py-2 pr-4 text-zinc-400 max-w-md">{c.rationale}</td>
            <td className="py-2 pr-4 text-zinc-500 text-xs whitespace-nowrap">
              {new Date(c.discoveredAt).toLocaleString()}
            </td>
            <td className="py-2 whitespace-nowrap">
              <button
                onClick={() => approve(c.key)}
                className="px-2 py-1 mr-2 bg-emerald-700/40 border border-emerald-600/60 rounded text-xs hover:bg-emerald-700/60"
              >
                Approve
              </button>
              <button
                onClick={() => skip(c.key, c.type)}
                className="px-2 py-1 border border-zinc-700 rounded text-xs hover:bg-zinc-800"
              >
                Skip
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
