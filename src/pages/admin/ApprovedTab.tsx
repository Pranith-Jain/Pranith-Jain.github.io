import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson, postJsonWithBody } from './adminApi';

interface Candidate {
  key: string;
  type: string;
  title: string;
  score: number;
}

export default function ApprovedTab() {
  const [approved, setApproved] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getJson<{ approved: Candidate[] }>('/approved');
      setApproved(d.approved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unapprove(id: string) {
    setPublishMsg(null);
    try {
      await postJson(`/approved/${encodeURIComponent(id)}/unapprove`);
      setPublishMsg(`Unapproved ${id}`);
      await load();
    } catch (e) {
      setPublishMsg(`unapprove failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function publishNow(id: string) {
    setPublishing(id);
    setPublishMsg(null);
    try {
      const r = await postJsonWithBody<{ ok?: boolean; slug?: string; error?: string }>(
        `/approved/${encodeURIComponent(id)}/publish-now`,
        {}
      );
      setPublishMsg(r.ok ? `Published! /blog/${r.slug}` : `Error: ${r.error}`);
      await load();
    } catch (e) {
      setPublishMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPublishing(null);
    }
  }

  // Fast lane: queue for the next hourly publisher run (live <1h) instead of
  // generating synchronously now (publish-now) or waiting for the daily planner.
  async function publishSoon(id: string) {
    setPublishing(id);
    setPublishMsg(null);
    try {
      const r = await postJson<{ ok?: boolean; slotAt?: string; error?: string }>(
        `/approved/${encodeURIComponent(id)}/publish-soon`
      );
      setPublishMsg(r.ok ? 'Queued for the next hourly publish (≤1h)' : `Error: ${r.error}`);
      await load();
    } catch (e) {
      setPublishMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPublishing(null);
    }
  }

  if (loading) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;
  if (error)
    return (
      <div>
        <p className="text-rose-600 dark:text-rose-400 mb-2">Failed to load: {error}</p>
        <button
          onClick={() => void load()}
          className="px-3 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm"
        >
          Retry
        </button>
      </div>
    );
  if (approved.length === 0)
    return (
      <div>
        {publishMsg && (
          <p className="mb-4 p-3 rounded text-sm font-mono bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            {publishMsg}
          </p>
        )}
        <p className="text-slate-500 dark:text-slate-400">No approved candidates.</p>
      </div>
    );

  return (
    <div>
      {publishMsg && (
        <p className="mb-4 p-3 rounded text-sm font-mono bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          {publishMsg}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
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
              <tr key={c.key} className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                <td className="py-2 pr-4 text-slate-500 dark:text-slate-400 uppercase text-xs">{c.type}</td>
                <td className="py-2 pr-4 text-slate-900 dark:text-slate-100">{c.title}</td>
                <td className="py-2 pr-4 text-slate-700 dark:text-slate-300 tabular-nums">{c.score.toFixed(2)}</td>
                <td className="py-2 flex gap-2">
                  <button
                    onClick={() => publishNow(c.key)}
                    disabled={publishing === c.key}
                    className="px-2 py-1 border border-emerald-700 rounded text-xs hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-50"
                  >
                    {publishing === c.key ? 'Publishing…' : 'Publish now'}
                  </button>
                  <button
                    onClick={() => publishSoon(c.key)}
                    disabled={publishing === c.key}
                    className="px-2 py-1 border border-sky-700 rounded text-xs hover:bg-sky-50 dark:hover:bg-sky-900/30 disabled:opacity-50"
                    title="Queue for the next hourly publish (≤1h)"
                  >
                    Publish soon
                  </button>
                  <button
                    onClick={() => unapprove(c.key)}
                    className="px-2 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-xs hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
                  >
                    Unapprove
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
