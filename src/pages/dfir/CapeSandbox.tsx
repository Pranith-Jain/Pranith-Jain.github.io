import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Bug,
  FileWarning,
  Globe,
  Hash,
  Link2,
  Loader2,
  Lock,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { VerdictChip } from '../../components/dfir/VerdictChip';
import { CopyChip } from '../../components/dfir/CopyButton';
import { adminAuthHeaders, readAdminToken, writeAdminToken } from '../../lib/admin-token';
import { fetchJson } from '../../lib/fetch-json';
import { useFeatures } from '../../lib/features';
import type { Verdict } from '../../lib/dfir/types';

interface NormalizedReport {
  task_id: number;
  score: number;
  verdict: Verdict;
  signatures: Array<{ name: string; description?: string; severity?: number }>;
  dropped: Array<{ name?: string; sha256?: string }>;
  iocs: { domains: string[]; ips: string[]; urls: string[]; hashes: string[] };
  target?: { filename?: string; sha256?: string };
}

type Phase = 'idle' | 'submitting' | 'polling' | 'done' | 'error';

const DONE_OK = new Set(['reported', 'completed']);
const POLL_MS = 4000;
const MAX_POLLS = 150; // ~10 minutes

const CARD = 'rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4';
const H2 =
  'text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono inline-flex items-center gap-2';

function IocList({ title, icon, items }: { title: string; icon: JSX.Element; items: string[] }): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1.5 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {icon} {title} ({items.length})
      </h3>
      <ul className="space-y-1">
        {items.map((v) => (
          <li
            key={v}
            className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 dark:bg-slate-950"
          >
            <Link
              to={`/dfir/ioc-check?indicator=${encodeURIComponent(v)}`}
              className="truncate font-mono text-[12px] text-slate-700 hover:text-brand-600 dark:text-slate-300"
              title={`Enrich ${v}`}
            >
              {v}
            </Link>
            <CopyChip value={v} label="copy" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CapeSandbox(): JSX.Element {
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(readAdminToken()));
  const [tokenInput, setTokenInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [taskId, setTaskId] = useState<number | null>(null);
  const [statusText, setStatusText] = useState('');
  const [report, setReport] = useState<NormalizedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupHint, setSetupHint] = useState<string | null>(null);
  const pollCount = useRef(0);
  const { cape, loaded } = useFeatures();

  const submit = useCallback(async () => {
    if (!file) return;
    setError(null);
    setSetupHint(null);
    setReport(null);
    setTaskId(null);
    setPhase('submitting');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/v1/cape/submit', { method: 'POST', headers: adminAuthHeaders(), body: fd });
      if (res.status === 503) {
        const body = (await res.json().catch(() => ({}))) as { setup?: string };
        setSetupHint(body.setup ?? 'CAPE sandbox is not configured on this deployment.');
        setPhase('error');
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { task_id: number };
      setTaskId(body.task_id);
      setStatusText('pending');
      pollCount.current = 0;
      setPhase('polling');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'submit failed');
      setPhase('error');
    }
  }, [file]);

  useEffect(() => {
    if (phase !== 'polling' || taskId == null) return;
    let cancelled = false;
    const iv = setInterval(async () => {
      pollCount.current += 1;
      if (pollCount.current > MAX_POLLS) {
        clearInterval(iv);
        if (!cancelled) {
          setError('Timed out waiting for CAPE analysis to finish.');
          setPhase('error');
        }
        return;
      }
      try {
        const s = await fetchJson<{ id: number; status: string }>(`/api/v1/cape/task/${taskId}`, {
          headers: adminAuthHeaders(),
        });
        if (cancelled) return;
        setStatusText(s.status);
        if (s.status.startsWith('failed')) {
          clearInterval(iv);
          setError(`CAPE analysis failed (${s.status}).`);
          setPhase('error');
          return;
        }
        if (DONE_OK.has(s.status)) {
          clearInterval(iv);
          const rep = await fetchJson<NormalizedReport>(`/api/v1/cape/report/${taskId}`, {
            headers: adminAuthHeaders(),
          });
          if (!cancelled) {
            setReport(rep);
            setPhase('done');
          }
        }
      } catch (e) {
        clearInterval(iv);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'polling failed');
          setPhase('error');
        }
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [phase, taskId]);

  const busy = phase === 'submitting' || phase === 'polling';

  // The CAPE bridge is a dormant, self-hosted integration. When the
  // deployment hasn't configured it, the tool is hidden from nav/search;
  // a direct visit here redirects back to the hub rather than showing a
  // tool that can only return a 503 setup hint.
  if (loaded && !cape) return <Navigate to="/dfir" replace />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <BackLink
        to="/dfir"
        className="mb-8 inline-flex items-center gap-2 font-mono text-sm text-slate-600 hover:text-brand-600 dark:text-slate-400"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <header className="mb-6 mt-2">
        <h1 className="inline-flex items-center gap-2 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
          <Bug size={22} className="text-brand-600 dark:text-brand-400" /> CAPE sandbox
        </h1>
        <p className="mt-2 max-w-prose text-sm text-slate-600 dark:text-slate-400">
          Detonate a sample in a self-hosted{' '}
          <a
            href="https://github.com/kevoreilly/CAPEv2"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
          >
            CAPEv2
          </a>{' '}
          instance and pull back signatures, dropped files, and network IOCs. Admin-gated — the sample is proxied to
          your sandbox, never executed here.
        </p>
      </header>

      {!hasToken ? (
        <section className={CARD}>
          <h2 className={H2}>
            <Lock size={12} /> admin token required
          </h2>
          <p className="mb-3 mt-2 text-[12px] text-slate-500">
            Submitting malware is an admin action. Paste your operator token to continue.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="ADMIN_TOKEN"
              className="flex-1 rounded border border-slate-200 bg-white px-3 py-2 font-mono text-[12px] focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
            />
            <button
              type="button"
              disabled={!tokenInput.trim()}
              onClick={() => {
                writeAdminToken(tokenInput.trim());
                setHasToken(true);
                setTokenInput('');
              }}
              className="inline-flex items-center gap-2 rounded bg-brand-600 px-4 py-2 font-mono text-[12px] font-semibold text-white hover:bg-brand-700 disabled:opacity-30 dark:bg-brand-500"
            >
              Unlock
            </button>
          </div>
        </section>
      ) : (
        <section className={`${CARD} mb-6`}>
          <h2 className={H2}>
            <Upload size={12} /> submit a sample
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
              className="min-w-[200px] flex-1 font-mono text-[13px] file:mr-3 file:rounded file:border-0 file:bg-brand-100 file:px-3 file:py-1.5 file:font-mono file:text-[12px] file:font-semibold file:text-brand-700 dark:file:bg-brand-900 dark:file:text-brand-300"
            />
            <button
              type="button"
              disabled={!file || busy}
              onClick={submit}
              className="inline-flex items-center gap-2 rounded bg-brand-600 px-4 py-2 font-mono text-[12px] font-semibold text-white hover:bg-brand-700 disabled:opacity-30 dark:bg-brand-500"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
              {phase === 'submitting' ? 'Uploading…' : phase === 'polling' ? 'Analysing…' : 'Detonate'}
            </button>
          </div>
          {phase === 'polling' && (
            <p className="mt-3 animate-pulse font-mono text-[12px] text-slate-500">
              task #{taskId} · status: {statusText || 'queued'} · polling every {POLL_MS / 1000}s…
            </p>
          )}
        </section>
      )}

      {setupHint && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <FileWarning size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="font-mono text-[12px] text-amber-700 dark:text-amber-300">{setupHint}</p>
        </div>
      )}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <AlertTriangle size={16} className="shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="font-mono text-[12px] text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {report && phase === 'done' && (
        <section className={`${CARD} space-y-5`}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={H2}>
              <ShieldAlert size={12} /> report · task #{report.task_id}
            </h2>
            <VerdictChip verdict={report.verdict} />
            <span className="font-mono text-[12px] text-slate-500">{report.score}/100</span>
            {report.target?.filename && (
              <span className="font-mono text-[12px] text-slate-500">{report.target.filename}</span>
            )}
          </div>

          {report.signatures.length > 0 && (
            <div>
              <h3 className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                signatures ({report.signatures.length})
              </h3>
              <ul className="space-y-1">
                {report.signatures.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-start gap-2 rounded bg-slate-50 px-2 py-1 font-mono text-[12px] dark:bg-slate-950"
                  >
                    <span className="shrink-0 font-semibold text-rose-600 dark:text-rose-400">{s.name}</span>
                    {s.description && <span className="text-slate-500">{s.description}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <IocList title="domains" icon={<Globe size={12} />} items={report.iocs.domains} />
            <IocList title="ips" icon={<Globe size={12} />} items={report.iocs.ips} />
            <IocList title="urls" icon={<Link2 size={12} />} items={report.iocs.urls} />
            <IocList title="hashes" icon={<Hash size={12} />} items={report.iocs.hashes} />
          </div>

          {report.dropped.length > 0 && (
            <div>
              <h3 className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                dropped files ({report.dropped.length})
              </h3>
              <ul className="space-y-1">
                {report.dropped.map((d, i) => (
                  <li
                    key={d.sha256 ?? `${d.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 font-mono text-[12px] dark:bg-slate-950"
                  >
                    <span className="truncate text-slate-700 dark:text-slate-300">{d.name ?? d.sha256 ?? '—'}</span>
                    {d.sha256 && <CopyChip value={d.sha256} label="sha256" />}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.iocs.domains.length === 0 &&
            report.iocs.ips.length === 0 &&
            report.iocs.urls.length === 0 &&
            report.iocs.hashes.length === 0 &&
            report.signatures.length === 0 && (
              <p className="font-mono text-[12px] text-slate-500">No signatures or network IOCs extracted.</p>
            )}
        </section>
      )}
    </div>
  );
}
