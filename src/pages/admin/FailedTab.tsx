import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson } from './adminApi';

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getJson<{ failures: FailureRecord[] }>('/failures');
      setFailures(d.failures);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function clearOne(slotId: string) {
    setBusy(slotId);
    setActionMsg(null);
    try {
      await postJson(`/failures/${encodeURIComponent(slotId)}/clear`);
      setActionMsg(`Cleared ${slotId}`);
      await load();
    } catch (e) {
      setActionMsg(`clear failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function clearAll() {
    if (!window.confirm(`Clear all ${failures.length} failure records? This is irreversible.`)) return;
    setBusy('__all');
    setActionMsg(null);
    try {
      const r = await postJson<{ ok: boolean; cleared: number }>('/failures/clear-all');
      setActionMsg(`Cleared ${r.cleared} record(s)`);
      await load();
    } catch (e) {
      setActionMsg(`clear-all failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-zinc-400">Loading…</p>;
  if (error)
    return (
      <div>
        <p className="text-red-400 mb-2">Failed to load: {error}</p>
        <button onClick={load} className="px-3 py-1 border border-zinc-700 rounded text-sm">
          Retry
        </button>
      </div>
    );
  if (failures.length === 0)
    return (
      <div>
        {actionMsg && <p className="text-xs font-mono text-zinc-400 mb-2">{actionMsg}</p>}
        <p className="text-zinc-400">No failures recorded.</p>
      </div>
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        {actionMsg ? (
          <p className="text-xs font-mono text-zinc-400">{actionMsg}</p>
        ) : (
          <p className="text-xs font-mono text-zinc-500">{failures.length} failure(s) recorded</p>
        )}
        <button
          type="button"
          onClick={clearAll}
          disabled={busy !== null}
          className="px-2.5 py-1 border border-zinc-700 rounded text-xs hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy === '__all' ? 'Clearing…' : 'Clear all'}
        </button>
      </div>
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
              <th scope="col" className="py-2 pr-4">
                Retries
              </th>
              <th scope="col" className="py-2">
                Actions
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
                <td className="py-2 pr-4 text-zinc-300 tabular-nums">{f.retries}</td>
                <td className="py-2">
                  <button
                    onClick={() => clearOne(f.slotId)}
                    disabled={busy === f.slotId}
                    className="px-2 py-1 border border-zinc-700 rounded text-xs hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {busy === f.slotId ? '…' : 'Clear'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
