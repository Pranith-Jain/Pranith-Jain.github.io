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
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CircleDashed,
  ArrowRight,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { ToolJsonLd } from '../components/seo/ToolJsonLd';

type Status = 'ok' | 'degraded' | 'down' | 'cold';

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

const PILL: Record<Status, { cls: string; label: string; icon: LucideIcon; ring: string; dot: string }> = {
  ok: {
    cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
    label: 'Operational',
    icon: CheckCircle2,
    ring: 'ring-emerald-500/20',
    dot: 'bg-emerald-500',
  },
  degraded: {
    cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40',
    label: 'Degraded',
    icon: AlertTriangle,
    ring: 'ring-amber-500/20',
    dot: 'bg-amber-500',
  },
  down: {
    cls: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/40',
    label: 'Down',
    icon: XCircle,
    ring: 'ring-rose-500/20',
    dot: 'bg-rose-500',
  },
  cold: {
    cls: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/40',
    label: 'Cold',
    icon: CircleDashed,
    ring: 'ring-slate-500/20',
    dot: 'bg-slate-400',
  },
};

const CREDIBILITY_LABEL: Record<number, string> = {
  1: '1 · Confirmed',
  2: '2 · Probably true',
  3: '3 · Possibly true',
  4: '4 · Doubtful',
  5: '5 · Improbable',
  6: '6 · Cannot judge',
};

function ageString(s?: number): string {
  if (s === undefined) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function StatusPage(): JSX.Element {
  useDocumentMeta({
    title: 'System Status - DFIR & Threat Intel Platform',
    description:
      'Live health of every upstream feed and aggregation pipeline. See what is operational, degraded, or down right now.',
    section: 'API',
    canonicalPath: '/status',
  });

  const [data, setData] = useState<FeedStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/feed-status')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<FeedStatusResponse>;
      })
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = data?.rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    { ok: 0, degraded: 0, down: 0, cold: 0 } as Record<Status, number>
  );

  const overall = data?.overall ?? 'cold';
  const PillIcon = PILL[overall].icon;

  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <ToolJsonLd
        section="status"
        toolName="System Status"
        description="Live health of every upstream feed the platform aggregates, with admiralty grade and info-credibility per source."
        path="/status"
        category="Observability"
      />
      <header className="mb-10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
          <Activity className="h-3.5 w-3.5" /> Live system status
        </div>
        <h1 className="text-3xl font-bold text-slate-50 sm:text-4xl">Status</h1>
        <p className="mt-3 max-w-3xl text-base text-slate-300">
          Live health of every upstream feed the platform aggregates. Probes run on every request and are cached for 5
          minutes. When a /threatintel page looks empty, the answer is usually here first.
        </p>
      </header>

      <section
        className={`mb-10 rounded-xl border p-6 ${PILL[overall].cls} ${PILL[overall].ring} ring-1`}
        aria-label={`Overall status: ${PILL[overall].label}`}
      >
        <div className="flex items-center gap-3">
          <PillIcon className="h-7 w-7" aria-hidden="true" />
          <div>
            <div className="text-sm uppercase tracking-wider opacity-80">Overall</div>
            <div className="text-2xl font-bold">{PILL[overall].label}</div>
          </div>
        </div>
        {data && counts && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(['ok', 'degraded', 'down', 'cold'] as Status[]).map((s) => {
              const Icon = PILL[s].icon;
              return (
                <div
                  key={s}
                  className="flex items-center gap-2 rounded-md border border-current/30 bg-black/10 px-3 py-2"
                >
                  <Icon className="h-4 w-4" />
                  <div className="flex-1">
                    <div className="text-xs uppercase tracking-wider opacity-80">{PILL[s].label}</div>
                    <div className="font-mono text-lg font-semibold">{counts[s]}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {error && (
          <p className="mt-4 text-sm">
            Could not load feed status: {error}. The page may still be reachable via{' '}
            <Link to="/threatintel/feeds/status" className="underline">
              /threatintel/feeds/status
            </Link>
            .
          </p>
        )}
      </section>

      {data && (
        <section>
          <h2 className="mb-4 text-xl font-semibold text-slate-100">Per-feed status</h2>
          <ul className="space-y-2">
            {data.rows
              .slice()
              .sort((a, b) => {
                const order: Record<Status, number> = { down: 0, degraded: 1, cold: 2, ok: 3 };
                if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
                return a.label.localeCompare(b.label);
              })
              .map((r) => {
                const P = PILL[r.status];
                return (
                  <li key={r.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 sm:p-4">
                    <div className="flex flex-wrap items-start gap-3">
                      <span
                        className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${P.dot}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <h3 className="font-semibold text-slate-100">{r.label}</h3>
                          <span
                            className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${P.cls}`}
                          >
                            {P.label}
                          </span>
                          {r.admiralty_grade && (
                            <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                              Admiralty {r.admiralty_grade}
                            </span>
                          )}
                          {r.info_credibility !== undefined && (
                            <span
                              className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400"
                              title="NATO Admiralty information credibility (1=confirmed, 6=cannot judge)"
                            >
                              {CREDIBILITY_LABEL[r.info_credibility]}
                            </span>
                          )}
                          {r.upstream_age_s !== undefined && (
                            <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                              age {ageString(r.upstream_age_s)}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{r.reason}</p>
                      </div>
                      {r.page_path && (
                        <Link
                          to={r.page_path}
                          className="inline-flex items-center gap-1 self-end rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100"
                        >
                          Open page <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      )}

      <footer className="mt-12 border-t border-slate-800 pt-6 text-sm text-slate-500">
        <p>
          Source: <code className="text-slate-300">/api/v1/feed-status</code> · cached 5 min · rebuilt on every Worker
          request.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-3">
          <Link
            to="/threatintel/feeds/status"
            className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
          >
            Full feed workbench <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <span className="text-slate-700">|</span>
          <Link to="/api/docs" className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
            API spec <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <span className="text-slate-700">|</span>
          <Link to="/mcp" className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
            MCP server <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <span className="text-slate-700">|</span>
          <a
            href="https://github.com/Pranith-Jain"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
          >
            GitHub <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </p>
      </footer>
    </main>
  );
}
