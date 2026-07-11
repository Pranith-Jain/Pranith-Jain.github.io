import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, ExternalLink, ShieldAlert } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface AffectedEntity {
  name: string;
  note?: string;
}
interface IncidentSource {
  url: string;
  title: string;
  publisher: string;
}
interface Incident {
  id: string;
  url: string;
  title: string;
  status: string;
  severity: string;
  ecosystems: string[];
  attack_vectors: string[];
  disclosed_date: string;
  last_updated: string;
  blast_radius: string;
  affected_entities: AffectedEntity[];
  summary: string;
  iocs: Record<string, string[]>;
  remediation: string[];
  sources: IncidentSource[];
}
interface ScResponse {
  source: string;
  source_url: string;
  license: string;
  revised: string;
  generated_at: string;
  count: number;
  total: number;
  facets: {
    ecosystems: Record<string, number>;
    statuses: Record<string, number>;
    severities: Record<string, number>;
    attack_vectors: Record<string, number>;
  };
  incidents: Incident[];
  stale?: boolean;
  upstream_error?: string;
}

/** Only render http(s) links — the source urls come from an untrusted upstream,
 *  so never let a `javascript:`/`data:` URL reach an href. */
function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const SEVERITY_TONE: Record<string, string> = {
  critical: 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10',
  high: 'border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/10',
  medium: 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10',
  low: 'border-slate-400/50 text-slate-500 bg-slate-400/10',
};
const STATUS_TONE: Record<string, string> = {
  active: 'border-rose-500/50 text-rose-600 dark:text-rose-400',
  contained: 'border-amber-500/50 text-amber-600 dark:text-amber-400',
  resolved: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400',
  disputed: 'border-slate-400/50 text-slate-500',
};

function chip(active: boolean): string {
  return `text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
    active
      ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
      : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-brand-500/40'
  }`;
}

export default function SupplyChainAttacks(): JSX.Element {
  const [data, setData] = useState<ScResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eco, setEco] = useState('all');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/v1/supply-chain-attacks', { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(15_000)]) })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ScResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: { name?: string; message?: string }) => {
        if (!cancelled && e.name !== 'AbortError') setError(e.message ?? 'unknown');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  const ecosystems = useMemo(() => Object.entries(data?.facets.ecosystems ?? {}).sort((a, b) => b[1] - a[1]), [data]);
  const statuses = useMemo(() => Object.entries(data?.facets.statuses ?? {}).sort((a, b) => b[1] - a[1]), [data]);

  const filtered = useMemo(() => {
    const list = data?.incidents ?? [];
    return list.filter(
      (i) => (eco === 'all' || i.ecosystems.includes(eco)) && (status === 'all' || i.status === status)
    );
  }, [data, eco, status]);

  const description = (
    <>
      Confirmed software supply-chain compromise incidents (npm · PyPI · container registries · AI agents) — status,
      severity, blast radius, remediation, and advisory sources. Data:{' '}
      <a
        href="https://supplychainattack.org"
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-600 dark:text-brand-400 hover:underline"
      >
        supplychainattack.org
      </a>{' '}
      — a neutral public reference (free to cite with attribution). Each incident links back to its source.
    </>
  );

  const headerExtra =
    data && !error ? (
      <div className="space-y-2">
        {data.stale && (
          <p className="text-micro font-mono text-amber-600 dark:text-amber-400">
            ⚠ showing cached data (upstream temporarily unavailable)
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setEco('all')} className={chip(eco === 'all')}>
            All ecosystems <span className="opacity-60">· {data.total}</span>
          </button>
          {ecosystems.map(([name, n]) => (
            <button key={name} onClick={() => setEco(name)} className={chip(eco === name)}>
              {name} <span className="opacity-60">· {n}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setStatus('all')} className={chip(status === 'all')}>
            Any status
          </button>
          {statuses.map(([name, n]) => (
            <button key={name} onClick={() => setStatus(name)} className={chip(status === name)}>
              {name} <span className="opacity-60">· {n}</span>
            </button>
          ))}
        </div>
      </div>
    ) : undefined;

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<AlertOctagon size={28} />}
      title="Supply-chain attack incidents"
      description={description}
      headerExtra={headerExtra}
      loading={loading}
      error={error}
      empty={!loading && !error && !!data && filtered.length === 0}
      emptyMessage="No incidents match the filter."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.slice(0, 400).map((inc) => {
          const titleHref = safeHref(inc.url);
          const packages = inc.iocs.packages ?? [];
          return (
            <div
              key={inc.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 leading-snug">
                  {titleHref ? (
                    <a
                      href={titleHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-brand-600 dark:hover:text-brand-400"
                    >
                      {inc.title} <ExternalLink size={12} className="inline align-baseline opacity-60" />
                    </a>
                  ) : (
                    inc.title
                  )}
                </h3>
                {inc.severity && (
                  <span
                    className={`shrink-0 text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEVERITY_TONE[inc.severity.toLowerCase()] ?? SEVERITY_TONE.low}`}
                  >
                    {inc.severity}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {inc.status && (
                  <span
                    className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_TONE[inc.status.toLowerCase()] ?? STATUS_TONE.disputed}`}
                  >
                    {inc.status}
                  </span>
                )}
                {inc.ecosystems.map((e) => (
                  <span
                    key={e}
                    className="text-micro font-mono px-1.5 py-0.5 rounded border border-sky-500/40 text-sky-600 dark:text-sky-400"
                  >
                    {e}
                  </span>
                ))}
                {inc.attack_vectors.map((v) => (
                  <span
                    key={v}
                    className="text-micro font-mono px-1.5 py-0.5 rounded border border-violet-500/40 text-violet-600 dark:text-violet-400"
                  >
                    {v}
                  </span>
                ))}
                {inc.disclosed_date && (
                  <span className="text-micro font-mono text-slate-400 ml-auto">{inc.disclosed_date}</span>
                )}
              </div>

              {inc.summary && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">{inc.summary}</p>
              )}

              {inc.blast_radius && (
                <p className="text-micro font-mono text-slate-500 mt-2 flex items-start gap-1">
                  <ShieldAlert size={12} className="shrink-0 mt-0.5" /> {inc.blast_radius}
                </p>
              )}

              {packages.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {packages.slice(0, 12).map((pkg) => (
                    <Link
                      key={pkg}
                      to={`/dfir/ioc-check?indicator=${encodeURIComponent(pkg)}`}
                      className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400"
                      title="Pivot to IOC checker"
                    >
                      {pkg} →
                    </Link>
                  ))}
                </div>
              )}

              {inc.remediation.length > 0 && (
                <details className="mt-2 group">
                  <summary className="text-micro font-mono text-slate-500 cursor-pointer hover:text-brand-600 dark:hover:text-brand-400">
                    remediation · {inc.remediation.length}
                  </summary>
                  <ul className="mt-1 ml-3 list-disc text-xs text-slate-600 dark:text-slate-400 space-y-0.5">
                    {inc.remediation.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </details>
              )}

              {inc.sources.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  {inc.sources.map((s, i) => {
                    const href = safeHref(s.url);
                    return href ? (
                      <a
                        key={i}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline"
                        title={s.publisher}
                      >
                        {s.title || s.publisher || 'source'}
                      </a>
                    ) : (
                      <span key={i} className="text-micro font-mono text-slate-400">
                        {s.title || s.publisher}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {data && (
        <p className="mt-6 text-micro font-mono text-slate-400 text-center">
          Data:{' '}
          <a
            href={data.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-600 dark:hover:text-brand-400"
          >
            {data.source}
          </a>{' '}
          — a neutral public reference; free to cite with attribution
          {data.revised ? ` · catalog revised ${data.revised}` : ''} · {data.total} incidents
        </p>
      )}
    </DataPageLayout>
  );
}
