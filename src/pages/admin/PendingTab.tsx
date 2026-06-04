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
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getJson<{ pending: Candidate[] }>('/candidates');
      setPending(d.pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(id: string, type: string) {
    setActionMsg(null);
    try {
      // Pass `type` so the backend doesn't first-match across all 12 type
      // buckets — candidate `key`s aren't guaranteed unique across types.
      await postJson(`/candidates/${encodeURIComponent(id)}/approve?type=${encodeURIComponent(type)}`);
      setActionMsg(`Approved ${id}`);
      await load();
    } catch (e) {
      setActionMsg(`approve failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function skip(id: string, type: string) {
    setActionMsg(null);
    try {
      await postJson(`/candidates/${encodeURIComponent(id)}/skip?type=${encodeURIComponent(type)}`);
      setActionMsg(`Skipped ${id}`);
      await load();
    } catch (e) {
      setActionMsg(`skip failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function clearAll() {
    if (!window.confirm('Clear all pending candidates? They will be suppressed for 30 days.')) return;
    setActionMsg(null);
    try {
      const res = await postJson<{ cleared: number }>('/candidates/skip-all');
      setActionMsg(`Cleared ${res.cleared} candidate(s)`);
      await load();
    } catch (e) {
      setActionMsg(`clear all failed: ${e instanceof Error ? e.message : String(e)}`);
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
  if (pending.length === 0)
    return (
      <div>
        {actionMsg && <p className="text-xs font-mono text-slate-400 mb-2">{actionMsg}</p>}
        <p className="text-slate-400">No pending candidates.</p>
      </div>
    );

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        {actionMsg ? <p className="text-xs font-mono text-slate-400">{actionMsg}</p> : <span />}
        <button
          onClick={() => void clearAll()}
          className="px-2 py-1 border border-red-700/60 text-red-300 rounded text-xs hover:bg-red-900/30"
        >
          Clear all
        </button>
      </div>
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
              Score
            </th>
            <th scope="col" className="py-2 pr-4">
              Rationale
            </th>
            <th scope="col" className="py-2 pr-4">
              Discovered
            </th>
            <th scope="col" className="py-2">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {pending.map((c) => (
            <tr key={`${c.type}:${c.key}`} className="border-b border-zinc-800/60 align-top">
              <td className="py-2 pr-4 text-slate-400 uppercase text-xs">{c.type}</td>
              <td className="py-2 pr-4 text-slate-100">{c.title}</td>
              <td className="py-2 pr-4 text-slate-300 tabular-nums">{c.score.toFixed(2)}</td>
              <td className="py-2 pr-4 text-slate-400 max-w-md">{c.rationale}</td>
              <td className="py-2 pr-4 text-slate-500 text-xs whitespace-nowrap">
                {new Date(c.discoveredAt).toLocaleString()}
              </td>
              <td className="py-2 whitespace-nowrap">
                <button
                  onClick={() => approve(c.key, c.type)}
                  className="px-2 py-1 mr-2 bg-emerald-700/40 border border-emerald-600/60 rounded text-xs hover:bg-emerald-700/60"
                >
                  Approve
                </button>
                <button
                  onClick={() => skip(c.key, c.type)}
                  className="px-2 py-1 border border-slate-700 rounded text-xs hover:bg-slate-800"
                >
                  Skip
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
