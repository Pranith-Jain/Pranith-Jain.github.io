import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Info,
  Globe,
  FileText,
} from 'lucide-react';
import { RelatedWikiArticles } from '../../components/dfir/RelatedWikiArticles';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'good';

interface HeaderFinding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  value?: string;
}

interface ProbeResult {
  path: string;
  status: number;
  outcome: 'exposed' | 'not-found' | 'forbidden' | 'redirect' | 'error';
  severity: Severity;
  description: string;
  redirectsTo?: string;
}

interface WebScanResponse {
  url: string;
  final_url: string;
  status: number;
  redirect_blocked?: { location: string };
  http_protocol_findings: HeaderFinding[];
  exposed_paths: ProbeResult[];
  raw_headers: Record<string, string>;
  generated_at: string;
}

const SEV_PILL: Record<Severity, string> = {
  critical: 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300',
  high: 'border-orange-500/50 bg-orange-500/15 text-orange-700 dark:text-orange-300',
  medium: 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  low: 'border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  info: 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400',
  good: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4, good: 5 };

const SAMPLES: { label: string; url: string }[] = [
  { label: 'example.com', url: 'https://example.com' },
  { label: 'cloudflare.com', url: 'https://www.cloudflare.com' },
];

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function WebScan(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = searchParams.get('url') ?? searchParams.get('q') ?? '';
  const [url, setUrl] = useState(initial);
  const [data, setData] = useState<WebScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoFetched = useRef(false);

  const run = async (target: string) => {
    const t = target.trim();
    if (!t) return;
    setLoading(true);
    setError(null);
    setData(null);
    setSearchParams({ url: t }, { replace: true });
    try {
      const res = await fetch(`/api/v1/web-scan?url=${encodeURIComponent(t)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as WebScanResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoFetched.current) return;
    if (initial) {
      autoFetched.current = true;
      void run(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findings = useMemo(() => {
    if (!data) return [];
    return [...data.http_protocol_findings].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  }, [data]);

  const exposed = useMemo(() => {
    if (!data) return { exposed: [] as ProbeResult[], other: [] as ProbeResult[] };
    const e: ProbeResult[] = [];
    const o: ProbeResult[] = [];
    for (const p of data.exposed_paths) {
      if (p.outcome === 'exposed' || p.outcome === 'redirect') e.push(p);
      else o.push(p);
    }
    e.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
    return { exposed: e, other: o };
  }, [data]);

  const counts = useMemo(() => {
    if (!data) return null;
    const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0, good: 0 };
    for (const f of data.http_protocol_findings) c[f.severity]++;
    for (const p of data.exposed_paths) {
      if (p.outcome === 'exposed' || p.outcome === 'redirect') c[p.severity]++;
    }
    return c;
  }, [data]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <ShieldAlert size={28} className="text-brand-600 dark:text-brand-400" /> Web Vulnerability Scanner
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          Audit a public web URL — HTTP security headers, cookie attributes, version disclosure, and ~30 common exposed
          paths (<code>.git/</code>, <code>.env</code>, <code>/admin</code>, <code>phpinfo.php</code>,
          <code>robots.txt</code>, etc). Cached 30 min at the edge.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Pairs with{' '}
          <Link to="/dfir/domain" className="text-brand-600 dark:text-brand-400 hover:underline">
            Domain Inspector
          </Link>{' '}
          (DNS / email-auth),{' '}
          <Link to="/dfir/cert-search" className="text-brand-600 dark:text-brand-400 hover:underline">
            Cert Search
          </Link>{' '}
          (subdomain enumeration), and{' '}
          <Link to="/dfir/takeover" className="text-brand-600 dark:text-brand-400 hover:underline">
            Subdomain Takeover
          </Link>{' '}
          (CNAME drift). <strong>Only scan targets you own or have authorisation for.</strong> No port-scanning, no
          authenticated app scan, no exploitation — those need Nuclei/Nessus and target-owner consent.
        </p>
      </div>

      {/* Input */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(url);
          }}
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="px-4 py-2 rounded bg-brand-600 hover:bg-brand-700 text-white font-mono text-sm disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {loading ? 'scanning…' : 'scan'}
            </button>
          </div>
        </form>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <span className="text-[10px] font-mono text-slate-500 self-center mr-1">samples:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.url}
              type="button"
              onClick={() => {
                setUrl(s.url);
                void run(s.url);
              }}
              className="text-[11px] font-mono px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p className="text-sm font-mono text-rose-600 dark:text-rose-400 mb-4 inline-flex items-center gap-2">
          <AlertTriangle size={14} /> {error}
        </p>
      )}

      {data && counts && (
        <>
          {/* Summary */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono inline-flex items-center gap-2">
                <Globe size={12} /> Summary
              </h2>
              <span className="text-[11px] font-mono text-slate-500">HTTP {data.status}</span>
            </div>
            <code className="block font-mono text-sm text-slate-900 dark:text-slate-100 break-all bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 p-2 mb-3">
              {data.url}
            </code>
            <div className="flex flex-wrap gap-1.5">
              {(['critical', 'high', 'medium', 'low', 'info', 'good'] as const).map((s) => (
                <span
                  key={s}
                  className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEV_PILL[s]}`}
                >
                  {s}: {counts[s]}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-3 text-[11px] font-mono">
              <Link
                to={`/dfir/domain?d=${encodeURIComponent(safeHost(data.url))}`}
                className="px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/5 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/10"
              >
                → domain
              </Link>
              <Link
                to={`/dfir/cert-search?domain=${encodeURIComponent(safeHost(data.url))}`}
                className="px-2 py-0.5 rounded border border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10"
              >
                → certs
              </Link>
              <Link
                to={`/dfir/takeover?domain=${encodeURIComponent(safeHost(data.url))}`}
                className="px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
              >
                → takeover
              </Link>
              <Link
                to={`/dfir/url-preview?url=${encodeURIComponent(data.url)}`}
                className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
              >
                → preview
              </Link>
            </div>
          </section>

          {/* HTTP findings */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3 inline-flex items-center gap-2">
              <ShieldAlert size={12} /> HTTP / cookie findings ({findings.length})
            </h2>
            <ul className="space-y-2">
              {findings.map((f) => (
                <li
                  key={f.id}
                  className={`rounded border p-3 ${
                    f.severity === 'good'
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                      {f.severity === 'good' && (
                        <ShieldCheck size={12} className="inline text-emerald-600 dark:text-emerald-400 mr-1" />
                      )}
                      {f.title}
                    </h3>
                    <span
                      className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${SEV_PILL[f.severity]}`}
                    >
                      {f.severity}
                    </span>
                  </div>
                  {f.detail && <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400">{f.detail}</p>}
                  {f.value && (
                    <code className="block text-[11px] font-mono text-slate-500 dark:text-slate-500 mt-1 break-all bg-white dark:bg-slate-900 px-2 py-1 rounded">
                      {f.value}
                    </code>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Exposed paths */}
          {exposed.exposed.length > 0 && (
            <section className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4 mb-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300 font-mono mb-3 inline-flex items-center gap-2">
                <AlertTriangle size={12} /> Exposed paths ({exposed.exposed.length})
              </h2>
              <ul className="space-y-1.5">
                {exposed.exposed.map((p) => (
                  <li
                    key={p.path}
                    className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <a
                        href={`${data.url.replace(/\/$/, '')}${p.path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[12px] text-rose-700 dark:text-rose-300 hover:underline inline-flex items-center gap-1"
                      >
                        {p.path} <ExternalLink size={10} />
                      </a>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-500">HTTP {p.status}</span>
                        <span
                          className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEV_PILL[p.severity]}`}
                        >
                          {p.severity}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400 mt-0.5">
                      {p.description}
                      {p.redirectsTo && <span className="ml-2 text-slate-500">→ {p.redirectsTo}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Other probes — collapsed */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <details>
              <summary className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono cursor-pointer inline-flex items-center gap-2">
                <Info size={12} /> All probe results ({data.exposed_paths.length})
              </summary>
              <ul className="mt-3 space-y-1 font-mono text-[11px]">
                {data.exposed_paths.map((p) => (
                  <li
                    key={p.path}
                    className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1 last:border-0"
                  >
                    <span className="text-slate-700 dark:text-slate-300">{p.path}</span>
                    <span className="text-slate-500">
                      HTTP {p.status} · {p.outcome}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </section>

          {/* Raw headers */}
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
            <details>
              <summary className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono cursor-pointer inline-flex items-center gap-2">
                <FileText size={12} /> Raw response headers ({Object.keys(data.raw_headers).length})
              </summary>
              <dl className="grid sm:grid-cols-[180px_1fr] gap-x-4 gap-y-1 text-[11px] font-mono mt-3 max-h-96 overflow-auto">
                {Object.entries(data.raw_headers).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-slate-500 dark:text-slate-500 break-words">{k}</dt>
                    <dd className="text-slate-900 dark:text-slate-100 break-all border-b border-slate-100 dark:border-slate-800 pb-1">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </section>
        </>
      )}

      <RelatedWikiArticles />
    </div>
  );
}
