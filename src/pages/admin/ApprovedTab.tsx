import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson } from './adminApi';

interface Candidate {
  key: string;
  type: 'cve' | 'actor' | 'malware' | 'ransom';
  title: string;
  score: number;
}

export default function ApprovedTab() {
  const [approved, setApproved] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const d = await getJson<{ approved: Candidate[] }>('/approved');
      setApproved(d.approved);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unapprove(id: string) {
    try {
      await postJson(`/approved/${encodeURIComponent(id)}/unapprove`);
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
  if (approved.length === 0) return <p className="text-zinc-400">No approved candidates.</p>;

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
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
          <th scope="col" className="py-2">
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        {approved.map((c) => (
          <tr key={c.key} className="border-b border-zinc-800/60">
            <td className="py-2 pr-4 text-zinc-400 uppercase text-xs">{c.type}</td>
            <td className="py-2 pr-4 text-zinc-100">{c.title}</td>
            <td className="py-2 pr-4 text-zinc-300 tabular-nums">{c.score.toFixed(2)}</td>
            <td className="py-2">
              <button
                onClick={() => unapprove(c.key)}
                className="px-2 py-1 border border-zinc-700 rounded text-xs hover:bg-zinc-800"
              >
                Unapprove
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
