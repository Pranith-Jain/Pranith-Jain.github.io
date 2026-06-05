import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, FileWarning, Globe, Loader2, Lock, Mail, Radar, Search } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { CopyChip } from '../../components/dfir/CopyButton';
import { adminAuthHeaders, readAdminToken, writeAdminToken } from '../../lib/admin-token';

interface ReconResult {
  tool: string;
  target: string;
  subdomains: string[];
  hosts: string[];
  emails: string[];
  count: number;
}

const TOOLS = [
  { id: 'subfinder', label: 'Subfinder — passive subdomains' },
  { id: 'amass', label: 'Amass — attack-surface mapping' },
  { id: 'theharvester', label: 'theHarvester — emails/hosts' },
  { id: 'spiderfoot', label: 'SpiderFoot — OSINT footprint' },
] as const;

const CARD = 'rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4';
const H2 =
  'text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono inline-flex items-center gap-2';

function ResultList({
  title,
  icon,
  items,
  linkable,
}: {
  title: string;
  icon: JSX.Element;
  items: string[];
  linkable?: boolean;
}): JSX.Element | null {
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
            {linkable ? (
              <Link
                to={`/dfir/ioc-check?indicator=${encodeURIComponent(v)}`}
                className="truncate font-mono text-[12px] text-slate-700 hover:text-brand-600 dark:text-slate-300"
                title={`Enrich ${v}`}
              >
                {v}
              </Link>
            ) : (
              <span className="truncate font-mono text-[12px] text-slate-700 dark:text-slate-300">{v}</span>
            )}
            <CopyChip value={v} label="copy" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ReconBridge(): JSX.Element {
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(readAdminToken()));
  const [tokenInput, setTokenInput] = useState('');
  const [tool, setTool] = useState<string>('subfinder');
  const [target, setTarget] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReconResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupHint, setSetupHint] = useState<string | null>(null);

  const run = useCallback(async () => {
    const t = target.trim();
    if (!t) return;
    setError(null);
    setSetupHint(null);
    setResult(null);
    setRunning(true);
    try {
      const res = await fetch('/api/v1/recon/scan', {
        method: 'POST',
        headers: { ...adminAuthHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ tool, target: t }),
      });
      if (res.status === 503) {
        const body = (await res.json().catch(() => ({}))) as { setup?: string };
        setSetupHint(body.setup ?? 'Recon bridge is not configured on this deployment.');
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setResult((await res.json()) as ReconResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'recon failed');
    } finally {
      setRunning(false);
    }
  }, [tool, target]);

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
          <Radar size={22} className="text-brand-600 dark:text-brand-400" /> Recon bridge
        </h1>
        <p className="mt-2 max-w-prose text-sm text-slate-600 dark:text-slate-400">
          Run Subfinder, Amass, theHarvester, or SpiderFoot on a self-hosted bridge (these CLIs can&apos;t run on
          Workers). Admin-gated — active recon executes from your own infrastructure, so only run it against assets you
          are authorized to test.
        </p>
      </header>

      {!hasToken ? (
        <section className={CARD}>
          <h2 className={H2}>
            <Lock size={12} /> admin token required
          </h2>
          <p className="mb-3 mt-2 text-[12px] text-slate-500">Recon is an admin action. Paste your operator token.</p>
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
            <Search size={12} /> run recon
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select
              value={tool}
              onChange={(e) => setTool(e.target.value)}
              disabled={running}
              className="rounded border border-slate-200 bg-white px-3 py-2 font-mono text-[12px] focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
            >
              {TOOLS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void run();
              }}
              placeholder="example.com"
              disabled={running}
              className="min-w-[200px] flex-1 rounded border border-slate-200 bg-white px-3 py-2 font-mono text-[13px] focus:border-brand-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
            />
            <button
              type="button"
              disabled={!target.trim() || running}
              onClick={() => void run()}
              className="inline-flex items-center gap-2 rounded bg-brand-600 px-4 py-2 font-mono text-[12px] font-semibold text-white hover:bg-brand-700 disabled:opacity-30 dark:bg-brand-500"
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Radar size={14} />}
              {running ? 'Running…' : 'Run'}
            </button>
          </div>
          {running && (
            <p className="mt-3 animate-pulse font-mono text-[12px] text-slate-500">
              running {tool} against {target.trim()} — passive sweeps can take up to ~2 min…
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

      {result && (
        <section className={`${CARD} space-y-5`}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={H2}>
              <Radar size={12} /> {result.tool} · {result.target}
            </h2>
            <span className="font-mono text-[12px] text-slate-500">{result.count} results</span>
          </div>
          {result.count === 0 ? (
            <p className="font-mono text-[12px] text-slate-500">No results returned.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <ResultList title="subdomains" icon={<Globe size={12} />} items={result.subdomains} linkable />
              <ResultList title="hosts" icon={<Globe size={12} />} items={result.hosts} linkable />
              <ResultList title="emails" icon={<Mail size={12} />} items={result.emails} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
