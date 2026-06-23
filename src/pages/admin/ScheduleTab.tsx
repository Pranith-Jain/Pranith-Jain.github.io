import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson, postJsonWithBody } from './adminApi';

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
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Backend's /admin/schedule handler already revalidates each published
  // slot against /posts/<slug> and downgrades stale rows to 'pending', so
  // the client just renders the response verbatim. The previous in-browser
  // post-exists fan-out used an unauthenticated raw fetch — that would
  // start mis-labelling rows the moment the blog endpoint got gated.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getJson<{ schedule: Slot[] }>('/schedule');
      setSchedule(d.schedule);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function publishNow(candidateId: string) {
    setPublishing(candidateId);
    setMsg(null);
    try {
      const r = await postJsonWithBody<{ ok?: boolean; slug?: string; error?: string }>(
        `/schedule/${encodeURIComponent(candidateId)}/publish-now`,
        {}
      );
      setMsg(r.ok ? `Published! /blog/${r.slug}` : `Error: ${r.error}`);
      await load();
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPublishing(null);
    }
  }

  async function removeSlot(candidateId: string) {
    setPublishing(candidateId);
    setMsg(null);
    try {
      await postJson(`/schedule/${encodeURIComponent(candidateId)}/remove`);
      setMsg('Removed');
      await load();
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPublishing(null);
    }
  }

  async function reschedule(candidateId: string) {
    const input = window.prompt('Reschedule to (local date/time, e.g. 2026-06-10 14:30):');
    if (!input) return;
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) {
      setMsg('Invalid date/time');
      return;
    }
    setPublishing(candidateId);
    setMsg(null);
    try {
      const r = await postJsonWithBody<{ ok?: boolean; slotAt?: string; error?: string }>(
        `/schedule/${encodeURIComponent(candidateId)}/reschedule`,
        { slotAt: d.toISOString() }
      );
      setMsg(r.ok && r.slotAt ? `Rescheduled to ${new Date(r.slotAt).toLocaleString()}` : `Error: ${r.error}`);
      await load();
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPublishing(null);
    }
  }

  if (loading) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;
  if (error)
    return (
      <div>
        <p className="text-red-600 dark:text-red-400 mb-2">Failed to load: {error}</p>
        <button
          onClick={() => void load()}
          className="px-3 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm"
        >
          Retry
        </button>
      </div>
    );
  if (schedule.length === 0) return <p className="text-slate-500 dark:text-slate-400">No scheduled slots.</p>;

  return (
    <div>
      {msg && (
        <p className="mb-4 p-3 rounded text-sm font-mono bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
          {msg}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-600 dark:text-slate-500 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
            <tr>
              <th scope="col" className="py-2 pr-4">
                Slot time
              </th>
              <th scope="col" className="py-2 pr-4">
                Candidate ID
              </th>
              <th scope="col" className="py-2 pr-4">
                Status
              </th>
              <th scope="col" className="py-2">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((s, i) => (
              <tr
                key={`${s.candidateId}-${i}`}
                className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]"
              >
                <td className="py-2 pr-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  {new Date(s.slotAt).toLocaleString()}
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-slate-500 dark:text-slate-400">{s.candidateId}</td>
                <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{s.status}</td>
                <td className="py-2 flex gap-2">
                  {s.status === 'pending' && (
                    <>
                      <button
                        onClick={() => publishNow(s.candidateId)}
                        disabled={publishing === s.candidateId}
                        className="px-2 py-1 border border-green-700 rounded text-xs hover:bg-green-50 dark:hover:bg-green-900/30 disabled:opacity-50"
                      >
                        {publishing === s.candidateId ? 'Publishing…' : 'Publish now'}
                      </button>
                      <button
                        onClick={() => reschedule(s.candidateId)}
                        disabled={publishing === s.candidateId}
                        className="px-2 py-1 border border-sky-700 rounded text-xs hover:bg-sky-50 dark:hover:bg-sky-900/30 disabled:opacity-50"
                        title="Move this slot to a new date/time"
                      >
                        Reschedule
                      </button>
                      <button
                        onClick={() => removeSlot(s.candidateId)}
                        disabled={publishing === s.candidateId}
                        className="px-2 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-xs hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </>
                  )}
                  {s.status === 'published' && s.publishedSlug && (
                    <a
                      href={`/blog/${s.publishedSlug}`}
                      className="text-xs text-slate-500 dark:text-slate-400 underline px-2 py-1"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View
                    </a>
                  )}
                  {s.status === 'failed' && (
                    <button
                      onClick={() => removeSlot(s.candidateId)}
                      disabled={publishing === s.candidateId}
                      className="px-2 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-xs hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
