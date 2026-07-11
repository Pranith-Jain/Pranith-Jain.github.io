/**
 * /status - public status page.
 *
 * A UptimeRobot-style health view that uses the same /api/v1/feed-status
 * endpoint the in-app FeedStatus page consumes. Two surfaces in one:
 *
 *   1. Overall system health (single OK/DEGRADED/DOWN/COLD pill).
 *   2. Per-feed status grid with admiralty grade, info-credibility, and
 *      a link to the page on the live site that's affected.
 *
 * Distinct from /threatintel/feeds/status (which is the in-app workbench
 * with the full per-feed drill-down, metrics, and admiralty-explainer):
 * /status is the public, mobile-first landing page.
 *
 * Visual tokens (PILL, CREDIBILITY, RELIABILITY_TONE, ageString) are
 * imported from `src/components/status/statusTones` so the two pages
 * stay byte-aligned. Do not redeclare them locally.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ExternalLink } from 'lucide-react';
import { DataPageLayout } from '../components/DataPageLayout';
import { PageMeta } from '../components/PageMeta';
import { PILL, CREDIBILITY, RELIABILITY_TONE, ageString, type Status } from '../components/status/statusTones';

import { ToolJsonLd } from '../components/seo/ToolJsonLd';

interface Row {
  id: string;
  label: string;
  page_path: string;
  api_path: string;
  status: Status;
  reason: string;
  metrics?: Record<string, number>;
  upstream_age_s?: number;
  reliability?: string;
  info_credibility?: number;
  admiralty_grade?: string;
}

interface FeedStatusResponse {
  generated_at: string;
  rows: Row[];
  overall: Status;
}

const ORDER: Record<Status, number> = { down: 0, degraded: 1, cold: 2, ok: 3 };

export default function StatusPage(): JSX.Element {
  const [data, setData] = useState<FeedStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch('/api/v1/feed-status', { signal: AbortSignal.any([ac.signal, AbortSignal.timeout(15_000)]) })
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<FeedStatusResponse>;
      })
      .then((d) => setData(d))
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => ac.abort();
  }, []);

  const onRetry = () => {
    setError(null);
    setData(null);
    fetch('/api/v1/feed-status')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<FeedStatusResponse>;
      })
      .then((d) => setData(d))
      .catch((e: Error) => setError(e.message));
  };

  const overall = data?.overall ?? 'cold';
  const PillIcon = PILL[overall].icon;
  const counts = useMemo(
    () =>
      data?.rows.reduce(
        (acc, r) => {
          acc[r.status] = (acc[r.status] ?? 0) + 1;
          return acc;
        },
        { ok: 0, degraded: 0, down: 0, cold: 0 } as Record<Status, number>
      ),
    [data]
  );

  const sortedRows = useMemo(
    () =>
      data?.rows.slice().sort((a, b) => {
        if (ORDER[a.status] !== ORDER[b.status]) return ORDER[a.status] - ORDER[b.status];
        return a.label.localeCompare(b.label);
      }) ?? [],
    [data]
  );

  return (
    <>
      <PageMeta
        title="System Status - DFIR & Threat Intel Platform"
        description="Live health of every upstream feed and aggregation pipeline. See what is operational, degraded, or down right now."
        section="API"
        canonicalPath="/status"
      />
      <DataPageLayout
        backTo="/"
        icon={<Activity size={28} />}
        title="System status"
        description="Live health of every upstream feed the platform aggregates. Probes run on every request and are cached for 5 minutes. When a /threatintel page looks empty, the answer is usually here first."
        maxWidthClass="max-w-5xl"
        error={error}
        onRetry={onRetry}
        loading={!data && !error}
      >
        <ToolJsonLd
          section="status"
          toolName="System Status"
          description="Live health of every upstream feed the platform aggregates, with admiralty grade and info-credibility per source."
          path="/status"
          category="Observability"
        />

        {/* Overall banner + counts */}
        <section className="surface-card p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider px-2 py-1 rounded border ${PILL[overall].cls}`}
            >
              <PillIcon size={12} /> overall {PILL[overall].label.toLowerCase()}
            </span>
            {counts &&
              (['ok', 'degraded', 'down', 'cold'] as const).map((s) => {
                const n = counts[s];
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
          </div>
          <span className="text-mini font-mono text-slate-500 dark:text-slate-400">
            {data ? `snapshot ${ageString(Math.round((Date.now() - Date.parse(data.generated_at)) / 1000))}` : '—'}
          </span>
        </section>

        {/* Per-feed rows */}
        {data && data.rows.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-display font-semibold text-slate-900 dark:text-slate-100">
              Per-feed status
            </h2>
            <ul className="grid gap-2">
              {sortedRows.map((r) => {
                const Icon = PILL[r.status].icon;
                const cred = r.info_credibility !== undefined ? CREDIBILITY[r.info_credibility] : undefined;
                const rel = r.reliability ? RELIABILITY_TONE[r.reliability] : undefined;
                return (
                  <li key={r.id} className="surface-card p-3">
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
                            title="NATO Admiralty information credibility for current data point"
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
                        {r.api_path} <ExternalLink size={12} />
                      </a>
                      {r.upstream_age_s !== undefined && (
                        <>
                          <span>·</span>
                          <span>upstream {ageString(r.upstream_age_s)}</span>
                        </>
                      )}
                      {r.admiralty_grade && (
                        <>
                          <span>·</span>
                          <span className="text-slate-500 dark:text-slate-400">admiralty {r.admiralty_grade}</span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <footer className="mt-12 pt-6 text-sm text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          <p>
            Source: <code>/api/v1/feed-status</code> · cached 5 min · rebuilt on every Worker request.
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-3">
            <Link
              to="/threatintel/source-health"
              className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
            >
              Full feed workbench →
            </Link>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <Link
              to="/api/docs"
              className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
            >
              API spec →
            </Link>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <Link
              to="/mcp"
              className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
            >
              MCP server →
            </Link>
          </p>
        </footer>
      </DataPageLayout>
    </>
  );
}
