import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson, postJsonWithBody } from './adminApi';

interface Slot {
  slotAt: string;
  candidateId: string;
  status: 'pending' | 'publishing' | 'published' | 'failed';
  publishedSlug?: string;
  error?: string;
  postExists?: boolean;
}

export default function ScheduleTab() {
  const [schedule, setSchedule] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const d = await getJson<{ schedule: Slot[] }>('/schedule');
      // Check which published slugs still have posts
      const withPostCheck = await Promise.all(
        d.schedule.map(async (s) => {
          if (s.status === 'published' && s.publishedSlug) {
            try {
              const r = await fetch(`/api/v1/blog/posts/${encodeURIComponent(s.publishedSlug)}`);
              return { ...s, postExists: r.ok };
            } catch {
              return { ...s, postExists: false };
            }
          }
          return s;
        })
      );
      setSchedule(withPostCheck);
    } catch {
      setError(true);
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
    <div>
      {msg && (
        <p className="mb-4 p-3 rounded text-sm font-mono bg-green-900/30 text-green-300 border border-green-800">
          {msg}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
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
            {schedule.map((s, i) => {
              const stalePublished = s.status === 'published' && !s.postExists;
              return (
                <tr key={`${s.candidateId}-${i}`} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-4 text-zinc-300 whitespace-nowrap">{new Date(s.slotAt).toLocaleString()}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-zinc-400">{s.candidateId}</td>
                  <td className="py-2 pr-4 text-zinc-300">{stalePublished ? 'removed' : s.status}</td>
                  <td className="py-2 flex gap-2">
                    {s.status === 'pending' && (
                      <>
                        <button
                          onClick={() => publishNow(s.candidateId)}
                          disabled={publishing === s.candidateId}
                          className="px-2 py-1 border border-green-700 rounded text-xs hover:bg-green-900/30 disabled:opacity-50"
                        >
                          {publishing === s.candidateId ? 'Publishing…' : 'Publish now'}
                        </button>
                        <button
                          onClick={() => removeSlot(s.candidateId)}
                          disabled={publishing === s.candidateId}
                          className="px-2 py-1 border border-zinc-700 rounded text-xs hover:bg-zinc-800 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </>
                    )}
                    {s.status === 'published' && s.publishedSlug && s.postExists && (
                      <a
                        href={`/blog/${s.publishedSlug}`}
                        className="text-xs text-zinc-400 underline px-2 py-1"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View
                      </a>
                    )}
                    {(stalePublished || s.status === 'failed') && (
                      <button
                        onClick={() => removeSlot(s.candidateId)}
                        disabled={publishing === s.candidateId}
                        className="px-2 py-1 border border-zinc-700 rounded text-xs hover:bg-zinc-800 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
