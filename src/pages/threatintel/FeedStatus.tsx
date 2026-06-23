import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { DataState } from '../../components/DataState';
import { ArrowLeft, Activity, ExternalLink, RefreshCw } from 'lucide-react';
import { type Status, PILL, CREDIBILITY, RELIABILITY_TONE, ageString } from '../../components/status/statusTones';

interface Row {
  id: string;
  label: string;
  page_path: string;
  api_path: string;
  status: Status;
  reason: string;
  metrics?: Record<string, number>;
  upstream_age_s?: number;
  /** NATO Admiralty source reliability letter (A–F) for this source. */
  reliability?: string;
  /** NATO Admiralty information credibility 1–6, computed for the *current* data point. */
  info_credibility?: number;
  /** Combined Admiralty grade in standard "B-2" notation. */
  admiralty_grade?: string;
}

interface FeedStatusResponse {
  generated_at: string;
  rows: Row[];
  overall: Status;
}

export default function FeedStatus(): JSX.Element {
  const [data, setData] = useState<FeedStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/v1/feed-status')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<FeedStatusResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Activity size={28} className="text-brand-600 dark:text-brand-400" /> Feed status
        </h1>
        <p className="text-muted mb-2 max-w-3xl leading-relaxed">
          Live health of every upstream-backed feed on /threatintel. Each row probes its API endpoint and reports
          whether the upstream is contributing data. When a page looks empty, check here first. The answer is usually
          "upstream is down", not "your config is wrong".
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-6">
          Probes every upstream-backed surface in parallel and reports a per-feed status row.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
        {data ? (
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider px-2 py-1 rounded border ${PILL[data.overall].cls}`}
            >
              {(() => {
                const Icon = PILL[data.overall].icon;
                return <Icon size={12} />;
              })()}
              overall {PILL[data.overall].label}
            </span>
            {(['ok', 'degraded', 'down', 'cold'] as const).map((s) => {
              const n = data.rows.filter((r) => r.status === s).length;
              if (n === 0) return null;
              return (
                <span
                  key={s}
                  className={`text-mini font-mono px-2 py-0.5 rounded border ${PILL[s].cls}`}
                  title={`${n} ${s}`}
                >
                  {n} {PILL[s].label.toLowerCase()}
                </span>
              );
            })}
            <span className="text-mini font-mono text-slate-500 dark:text-slate-400">
              snapshot {ageString(Math.round((Date.now() - Date.parse(data.generated_at)) / 1000))}
            </span>
          </div>
        ) : (
          <span className="text-mini font-mono text-slate-500 dark:text-slate-400">—</span>
        )}
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </section>

      <DataState
        loading={loading}
        error={error}
        empty={!!data && data.rows.length === 0}
        emptyLabel="No feeds reported."
        onRetry={() => setRefreshKey((k) => k + 1)}
        rows={8}
      >
        {data && (
          <ul className="grid gap-2">
            {data.rows.map((r) => {
              const Icon = PILL[r.status].icon;
              const cred = r.info_credibility !== undefined ? CREDIBILITY[r.info_credibility] : undefined;
              const rel = r.reliability ? RELIABILITY_TONE[r.reliability] : undefined;
              return (
                <li
                  key={r.id}
                  className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
                    <Link
                      to={r.page_path}
                      className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400"
                    >
                      {r.label}
                    </Link>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {rel && (
                        <span
                          className={`inline-flex items-center gap-1 text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${rel}`}
                          title={`NATO Admiralty source reliability: ${r.reliability}`}
                        >
                          rel {r.reliability}
                        </span>
                      )}
                      {cred && (
                        <span
                          className={`inline-flex items-center gap-1 text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${cred.tone}`}
                          title={`NATO Admiralty information credibility for current data point`}
                        >
                          {cred.label}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${PILL[r.status].cls}`}
                      >
                        <Icon size={10} /> {PILL[r.status].label}
                      </span>
                    </div>
                  </div>
                  <p className="text-meta font-mono text-muted leading-relaxed mb-1.5">{r.reason}</p>
                  <div className="flex flex-wrap items-center gap-2 text-micro font-mono text-slate-500">
                    <Link to={r.page_path} className="hover:text-brand-600 dark:hover:text-brand-400">
                      {r.page_path}
                    </Link>
                    <span>·</span>
                    <a
                      href={r.api_path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400"
                    >
                      {r.api_path} <ExternalLink size={9} />
                    </a>
                    {r.upstream_age_s !== undefined && (
                      <>
                        <span>·</span>
                        <span>upstream snapshot {ageString(r.upstream_age_s)}</span>
                      </>
                    )}
                    {r.admiralty_grade && (
                      <>
                        <span>·</span>
                        <span className="text-slate-500">admiralty {r.admiralty_grade}</span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DataState>
    </div>
  );
}
