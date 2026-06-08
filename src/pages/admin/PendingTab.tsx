import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson, postJsonWithBody } from './adminApi';

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

type GenResult = Record<string, unknown>;

interface SocialPreview {
  key: string;
  platform: string;
  content: string;
}

export default function PendingTab() {
  const [pending, setPending] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [generating, setGenerating] = useState<Record<string, string>>({});
  const [genResults, setGenResults] = useState<Record<string, GenResult>>({});
  const [socialPreview, setSocialPreview] = useState<SocialPreview | null>(null);

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
      const res = await postJsonWithBody<{ ok: boolean; result: Record<string, unknown>; errors?: string[] }>(
        `/candidates/${encodeURIComponent(id)}/generate?type=${encodeURIComponent(type)}`,
        { formats: ['blog'] }
      );
      if (res.ok) {
        setActionMsg(`Blog draft created from ${id}`);
      } else {
        setActionMsg(`approve failed: ${(res.errors ?? ['unknown']).join(', ')}`);
      }
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

  async function generate(candidate: Candidate, format: string) {
    const key = `${candidate.key}:${format}`;
    setGenerating((prev) => ({ ...prev, [key]: 'generating' }));
    setGenResults((prev) => ({ ...prev, [key]: {} }));
    try {
      const res = await postJsonWithBody<{ ok: boolean; result: GenResult; errors?: string[] }>(
        `/candidates/${encodeURIComponent(candidate.key)}/generate?type=${encodeURIComponent(candidate.type)}`,
        { formats: [format] }
      );
      setGenResults((prev) => ({ ...prev, [key]: res }));
      const content = (res.result?.[format] as { content?: string } | undefined)?.content ?? '';
      if (content) {
        setSocialPreview({ key: candidate.key, platform: format, content });
      }
      setActionMsg(`${format} generated for ${candidate.title.slice(0, 50)}`);
    } catch (e) {
      setActionMsg(`${format} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating((prev) => ({ ...prev, [key]: '' }));
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
          {pending.map((c) => {
            return (
              <tr key={`${c.type}:${c.key}`} className="border-b border-zinc-800/60 align-top">
                <td className="py-2 pr-4 text-slate-400 uppercase text-xs">{c.type}</td>
                <td className="py-2 pr-4 text-slate-100">{c.title}</td>
                <td className="py-2 pr-4 text-slate-300 tabular-nums">{c.score.toFixed(2)}</td>
                <td className="py-2 pr-4 text-slate-400 max-w-md">{c.rationale}</td>
                <td className="py-2 pr-4 text-slate-500 text-xs whitespace-nowrap">
                  {new Date(c.discoveredAt).toLocaleString()}
                </td>
                <td className="py-2 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => approve(c.key, c.type)}
                      className="px-2 py-1 bg-emerald-700/40 border border-emerald-600/60 rounded text-xs hover:bg-emerald-700/60"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => skip(c.key, c.type)}
                      className="px-2 py-1 border border-slate-700 rounded text-xs hover:bg-slate-800"
                    >
                      Skip
                    </button>
                    <GenerateBtn
                      label="LI"
                      busy={generating[`${c.key}:linkedin`]}
                      ok={genResults[`${c.key}:linkedin`]?.ok as boolean | undefined}
                      onClick={() => generate(c, 'linkedin')}
                    />
                    <GenerateBtn
                      label="Tw"
                      busy={generating[`${c.key}:twitter`]}
                      ok={genResults[`${c.key}:twitter`]?.ok as boolean | undefined}
                      onClick={() => generate(c, 'twitter')}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {socialPreview && <SocialPreviewPanel preview={socialPreview} onClose={() => setSocialPreview(null)} />}
    </div>
  );
}

function GenerateBtn({
  label,
  busy,
  ok,
  onClick,
}: {
  label: string;
  busy?: string;
  ok?: boolean;
  onClick: () => void;
}) {
  const base = 'px-2 py-1 rounded text-xs border ';
  if (busy === 'generating') {
    return (
      <button disabled className={base + 'border-amber-600/40 text-amber-500 opacity-60 cursor-wait'}>
        {label}…
      </button>
    );
  }
  if (ok === true) {
    return (
      <button disabled className={base + 'border-emerald-700/40 text-emerald-400 opacity-60'}>
        {label} ✓
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={base + 'border-blue-700/60 text-blue-300 hover:bg-blue-900/30 hover:border-blue-600/80'}
    >
      {label}
    </button>
  );
}

function SocialPreviewPanel({ preview, onClose }: { preview: SocialPreview; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select the textarea content
    }
  }

  return (
    <div className="mt-4 rounded border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          {preview.platform === 'linkedin' ? 'LinkedIn' : 'Twitter'} — {preview.key.slice(0, 50)}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => void copyText(preview.content)}
            className="px-2 py-1 border border-slate-700 rounded text-xs hover:bg-slate-800"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300">
            Close
          </button>
        </div>
      </div>
      <pre className="whitespace-pre-wrap text-sm text-slate-200 font-sans bg-zinc-950 border border-slate-800 rounded p-3 max-h-[60vh] overflow-y-auto leading-relaxed">
        {preview.content}
      </pre>
    </div>
  );
}
