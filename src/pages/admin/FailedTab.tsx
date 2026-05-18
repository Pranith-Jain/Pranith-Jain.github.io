import { useCallback, useEffect, useState } from 'react';
import { getJson } from './adminApi';

interface FailureRecord {
  slotId: string;
  candidateId: string;
  error: string;
  rawOutput?: string;
  failedAt: string;
  retries: number;
}

export default function FailedTab() {
  const [failures, setFailures] = useState<FailureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const d = await getJson<{ failures: FailureRecord[] }>('/failures');
      setFailures(d.failures);
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
  if (error)
    return (
      <div>
        <p className="text-red-400 mb-2">Failed to load</p>
        <button onClick={load} className="px-3 py-1 border border-zinc-700 rounded text-sm">
          Retry
        </button>
      </div>
    );
  if (failures.length === 0) return <p className="text-zinc-400">No failures recorded.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
          <tr>
            <th scope="col" className="py-2 pr-4">
              Slot ID
            </th>
            <th scope="col" className="py-2 pr-4">
              Candidate ID
            </th>
            <th scope="col" className="py-2 pr-4">
              Error
            </th>
            <th scope="col" className="py-2 pr-4">
              Failed at
            </th>
            <th scope="col" className="py-2">
              Retries
            </th>
          </tr>
        </thead>
        <tbody>
          {failures.map((f) => (
            <tr key={`${f.slotId}-${f.failedAt}`} className="border-b border-zinc-800/60 align-top">
              <td className="py-2 pr-4 font-mono text-xs text-zinc-400">{f.slotId}</td>
              <td className="py-2 pr-4 font-mono text-xs text-zinc-400">{f.candidateId}</td>
              <td className="py-2 pr-4 text-red-300 max-w-md break-words">{f.error}</td>
              <td className="py-2 pr-4 text-zinc-500 text-xs whitespace-nowrap">
                {new Date(f.failedAt).toLocaleString()}
              </td>
              <td className="py-2 text-zinc-300 tabular-nums">{f.retries}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
