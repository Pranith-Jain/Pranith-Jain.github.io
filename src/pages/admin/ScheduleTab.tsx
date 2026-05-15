import { useCallback, useEffect, useState } from 'react';
import { getJson } from './adminApi';

interface Slot {
  slotAt: string;
  candidateId: string;
  status: 'pending' | 'publishing' | 'published' | 'failed';
  publishedSlug?: string;
  error?: string;
}

export default function ScheduleTab() {
  const [schedule, setSchedule] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const d = await getJson<{ schedule: Slot[] }>('/schedule');
      setSchedule(d.schedule);
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
  if (schedule.length === 0) return <p className="text-zinc-400">No scheduled slots.</p>;

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
        <tr>
          <th scope="col" className="py-2 pr-4">
            Slot time
          </th>
          <th scope="col" className="py-2 pr-4">
            Candidate ID
          </th>
          <th scope="col" className="py-2">
            Status
          </th>
        </tr>
      </thead>
      <tbody>
        {schedule.map((s, i) => (
          <tr key={`${s.candidateId}-${i}`} className="border-b border-zinc-800/60">
            <td className="py-2 pr-4 text-zinc-300 whitespace-nowrap">{new Date(s.slotAt).toLocaleString()}</td>
            <td className="py-2 pr-4 font-mono text-xs text-zinc-400">{s.candidateId}</td>
            <td className="py-2 text-zinc-300">{s.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
