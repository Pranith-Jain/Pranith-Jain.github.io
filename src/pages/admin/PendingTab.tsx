import { useCallback, useEffect, useState } from 'react';
import { getJson, postJson, postJsonWithBody } from './adminApi';

interface Candidate {
  key: string;
  type: string;
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

/** Pull up to 3 source URLs out of a candidate's evidence so an operator can
 *  verify provenance before approving. Mirrors the shapes the backend
 *  discovery runners store (urls[], sources[], victims[].url, sourceUrl,
 *  cveId). The evidence is already loaded with each candidate; it was just
 *  never surfaced. */
function sourceLinksFrom(ev: Record<string, unknown>): string[] {
  const urls = new Set<string>();
  const push = (u: unknown) => {
    if (typeof u === 'string' && /^https?:\/\//.test(u)) urls.add(u);
  };
  push(ev.url); // breach, aisec, vulncheck, euvd, phishunt
  if (Array.isArray(ev.urls)) ev.urls.forEach(push); // cve, actor
  if (Array.isArray(ev.sources)) ev.sources.forEach(push); // agentic-trends, briefing, platform-data
  push(ev.sourceUrl);
  if (Array.isArray(ev.victims)) {
    for (const v of ev.victims) {
      if (v && typeof v === 'object') push((v as Record<string, unknown>).url);
    }
  }
  if (typeof ev.cveId === 'string') {
    const autoUrl = `https://nvd.nist.gov/vuln/detail/${ev.cveId}`;
    if (!urls.has(autoUrl)) urls.add(autoUrl);
  }
  return Array.from(urls).slice(0, 3);
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch (_catchErr) {
    console.error('hostOf failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return u;
  }
}

type LinkStatus = 'ok' | 'broken' | 'unchecked';

function statusBadge(status: LinkStatus): string {
  switch (status) {
    case 'ok':
      return '●';
    case 'broken':
      return '○';
    case 'unchecked':
      return '?';
  }
}

function statusColor(status: LinkStatus): string {
  switch (status) {
    case 'ok':
      return 'text-emerald-500';
    case 'broken':
      return 'text-rose-500';
    case 'unchecked':
      return 'text-slate-400';
  }
}

function statusTitle(status: LinkStatus): string {
  switch (status) {
    case 'ok':
      return 'Link verified';
    case 'broken':
      return 'Link returned error';
    case 'unchecked':
      return 'Link status not checked';
  }
}

function linkStatusFor(ev: Record<string, unknown>, url: string): LinkStatus {
  const statuses = (ev as Record<string, unknown>).sourceLinkStatuses;
  if (statuses && typeof statuses === 'object') {
    const s = (statuses as Record<string, string>)[url];
    if (s === 'ok' || s === 'broken') return s;
  }
  return 'unchecked';
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
      console.error('PendingTab failed:', e instanceof Error ? e.message : String(e));
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
      console.error('approve failed:', e instanceof Error ? e.message : String(e));
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
      console.error('skip failed:', e instanceof Error ? e.message : String(e));
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
      console.error('clearAll failed:', e instanceof Error ? e.message : String(e));
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
      console.error('generate failed:', e instanceof Error ? e.message : String(e));
      setActionMsg(`${format} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating((prev) => ({ ...prev, [key]: '' }));
    }
  }

  if (loading) return <p className="text-slate-500 dark:text-slate-400">Loading…</p>;
  if (error)
    return (
      <div>
        <p className="text-rose-700 dark:text-rose-400 mb-2">Failed to load: {error}</p>
        <button
          onClick={() => void load()}
          className="px-3 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-sm"
        >
          Retry
        </button>
      </div>
    );
  if (pending.length === 0)
    return (
      <div>
        {actionMsg && <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-2">{actionMsg}</p>}
        <p className="text-slate-500 dark:text-slate-400">No pending candidates.</p>
      </div>
    );

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        {actionMsg ? <p className="text-xs font-mono text-slate-500 dark:text-slate-400">{actionMsg}</p> : <span />}
        <button
          onClick={() => void clearAll()}
          className="px-2 py-1 border border-rose-200 dark:border-rose-700/60 text-rose-700 dark:text-rose-300 rounded text-xs hover:bg-rose-50 dark:hover:bg-rose-900/30"
        >
          Clear all
        </button>
      </div>
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
            <th scope="col" className="py-2 pr-4">
              Rationale
            </th>
            <th scope="col" className="py-2 pr-4">
              Source
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
              <tr
                key={`${c.type}:${c.key}`}
                className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] align-top"
              >
                <td className="py-2 pr-4 text-slate-500 dark:text-slate-400 uppercase text-xs">{c.type}</td>
                <td className="py-2 pr-4 text-slate-900 dark:text-slate-100">{c.title}</td>
                <td className="py-2 pr-4 text-slate-700 dark:text-slate-300 tabular-nums">{c.score.toFixed(2)}</td>
                <td className="py-2 pr-4 text-slate-500 dark:text-slate-400 max-w-md">{c.rationale}</td>
                <td className="py-2 pr-4 text-xs max-w-[12rem]">
                  {(() => {
                    const links = sourceLinksFrom(c.evidence);
                    if (links.length === 0) return <span className="text-slate-400 dark:text-slate-400">—</span>;
                    return (
                      <div className="flex flex-col gap-0.5">
                        {links.map((u) => {
                          const st = linkStatusFor(c.evidence, u);
                          return (
                            <span key={u} className="flex items-center gap-1 truncate">
                              <span className={`shrink-0 ${statusColor(st)} cursor-default`} title={statusTitle(st)}>
                                {statusBadge(st)}
                              </span>
                              <a
                                href={u}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={u}
                                className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                              >
                                {hostOf(u)}
                              </a>
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
                </td>
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-500 text-xs whitespace-nowrap">
                  {new Date(c.discoveredAt).toLocaleString()}
                </td>
                <td className="py-2 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => approve(c.key, c.type)}
                      className="px-2 py-1 bg-emerald-100 dark:bg-emerald-700/40 border border-emerald-200 dark:border-emerald-600/60 rounded text-xs hover:bg-emerald-200 dark:hover:bg-emerald-700/60"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => skip(c.key, c.type)}
                      className="px-2 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-xs hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
                    >
                      Skip
                    </button>
                    <GenerateBtn
                      label="LI"
                      title="Generate a LinkedIn draft from this candidate"
                      busy={generating[`${c.key}:linkedin`]}
                      ok={genResults[`${c.key}:linkedin`]?.ok as boolean | undefined}
                      onClick={() => generate(c, 'linkedin')}
                    />
                    <GenerateBtn
                      label="X"
                      title="Generate an X / Twitter draft from this candidate"
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
  title,
  busy,
  ok,
  onClick,
}: {
  label: string;
  title?: string;
  busy?: string;
  ok?: boolean;
  onClick: () => void;
}) {
  const base = 'px-2 py-1 rounded text-xs border ';
  if (busy === 'generating') {
    return (
      <button
        disabled
        title={title}
        className={
          base + 'border-amber-200 dark:border-amber-600/40 text-amber-700 dark:text-amber-500 opacity-60 cursor-wait'
        }
      >
        {label}…
      </button>
    );
  }
  if (ok === true) {
    return (
      <button
        disabled
        title={title}
        className={
          base + 'border-emerald-200 dark:border-emerald-700/40 text-emerald-700 dark:text-emerald-400 opacity-60'
        }
      >
        {label} ✓
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      title={title}
      className={
        base +
        'border-blue-200 dark:border-blue-700/60 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-300 dark:hover:border-blue-600/80'
      }
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
    } catch (_catchErr) {
      console.error('copyText failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      // fallback: select the textarea content
    }
  }

  return (
    <div className="mt-4 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          {preview.platform === 'linkedin' ? 'LinkedIn' : 'X / Twitter'} — {preview.key.slice(0, 50)}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => void copyText(preview.content)}
            className="px-2 py-1 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded text-xs hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            className="text-xs text-slate-600 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Close
          </button>
        </div>
      </div>
      <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200 font-sans bg-slate-50 dark:bg-[rgb(var(--surface-100))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded p-3 max-h-[60vh] overflow-y-auto leading-relaxed">
        {preview.content}
      </pre>
    </div>
  );
}
