import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, FileWarning, Crosshair, Fish, ExternalLink } from 'lucide-react';
import { SnapshotCard, type SnapshotAccent } from './SnapshotCard';
import { useWatchlist, watchHits } from './useWatchlist';
import { shortRel } from '../../lib/relativeTime';

/**
 * Live IOC snapshot for /threatintel/threat-map.
 *
 * Pairs the threat-map's geolocation choropleth with a real-time IOC
 * feed strip showing the freshest entries from URLhaus + MalwareBazaar +
 * ThreatFox + OpenPhish. Same compact-card shape as LiveSnapshotPanel
 * but specialised for IOC entries (each row is a IocEntry with type +
 * value + first_seen).
 *
 * Single fetch to /api/v1/ioc-snapshot — server-side fan-out.
 */

interface IocEntry {
  type: 'url' | 'domain' | 'ipv4' | 'hash' | 'cve';
  value: string;
  context?: string;
  timestamp?: string;
}

interface IocFeedSummary {
  source: string;
  source_name: string;
  fetched_at: string;
  count: number;
  total_in_feed?: number;
  entries: IocEntry[];
}

interface SourcePayload {
  ok: boolean;
  data: IocFeedSummary | null;
  error?: string;
}

interface IocSnapshotResp {
  generated_at: string;
  sources: Record<string, SourcePayload>;
}

const ITEM_LIMIT = 5;

interface CardSpec {
  key: string;
  title: string;
  Icon: typeof Link2;
  accent: SnapshotAccent;
  /** Pivot URL when clicking an entry value. */
  pivot?: (e: IocEntry) => string;
}

const CARDS: CardSpec[] = [
  {
    key: 'urlhaus',
    title: 'Malicious URLs',
    Icon: Link2,
    accent: 'rose',
    pivot: (e) => `/dfir/url-preview?url=${encodeURIComponent(e.value)}`,
  },
  {
    key: 'malwarebazaar',
    title: 'Malware samples',
    Icon: FileWarning,
    accent: 'orange',
    pivot: (e) => `/dfir/ioc-check?q=${encodeURIComponent(e.value)}`,
  },
  {
    key: 'threatfox',
    title: 'IOCs by type',
    Icon: Crosshair,
    accent: 'amber',
    pivot: (e) => `/dfir/ioc-check?q=${encodeURIComponent(e.value)}`,
  },
  {
    key: 'openphish',
    title: 'Phishing URLs',
    Icon: Fish,
    accent: 'fuchsia',
    pivot: (e) => `/dfir/url-preview?url=${encodeURIComponent(e.value)}`,
  },
];

function typeBadge(t: IocEntry['type']): string {
  switch (t) {
    case 'url':
      return 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300';
    case 'domain':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    case 'ipv4':
      return 'border-cyan-500/40 bg-cyan-500/10 text-sky-700 dark:text-sky-300';
    case 'hash':
      return 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300';
    case 'cve':
      return 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300';
    default:
      return 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500';
  }
}

export function IocSnapshotPanel(): JSX.Element {
  const [data, setData] = useState<IocSnapshotResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const watchlist = useWatchlist();

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/v1/ioc-snapshot', { signal: ctrl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as IocSnapshotResp;
        if (cancelled) return;
        setData(json);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setErr((e as Error).message);
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(timer);
    };
  }, []);

  const totalEntries = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.sources).reduce((n, s) => n + (s.data?.count ?? 0), 0);
  }, [data]);

  // Per-card watchlist hit counts — across the FULL response per source so
  // the badge reflects real matches even when the visible top-N hides them.
  const watchedBySource = useMemo(() => {
    const out: Record<string, number> = {};
    if (!data) return out;
    for (const [k, s] of Object.entries(data.sources)) {
      if (!s.data) continue;
      out[k] = s.data.entries.filter((e) => watchHits(`${e.value} ${e.context ?? ''}`, watchlist).length > 0).length;
    }
    return out;
  }, [data, watchlist]);
  const totalWatched = useMemo(() => Object.values(watchedBySource).reduce((a, b) => a + b, 0), [watchedBySource]);

  return (
    <section className="mt-12 mb-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-display font-bold text-xl inline-flex items-center gap-2 flex-wrap">
          Live IOC feeds
          {watchlist.length > 0 && totalWatched > 0 && (
            <span
              className="text-micro font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300"
              title={`${totalWatched} IOCs match your watchlist (${watchlist.join(', ')})`}
            >
              {totalWatched} watchlist hits
            </span>
          )}
        </h2>
        <span className="text-mini font-mono text-slate-500 dark:text-slate-400">
          {data
            ? `${totalEntries} fresh indicators across 4 abuse.ch + OpenPhish feeds`
            : err
              ? `load error: ${err}`
              : 'loading…'}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((c) => {
          const payload = data?.sources[c.key];
          const summary = payload?.data;
          const entries = summary?.entries.slice(0, ITEM_LIMIT) ?? [];
          return (
            <SnapshotCard
              key={c.key}
              accent={c.accent}
              icon={c.Icon}
              title={c.title}
              showNewBadge={false}
              watchCount={watchedBySource[c.key] ?? 0}
              watchTerms={watchlist}
              rightAction={
                <a
                  href={`https://abuse.ch/${c.key === 'openphish' ? '' : c.key + '/'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
                >
                  source <ExternalLink size={9} />
                </a>
              }
              loading={!payload && !err}
              error={payload && !payload.ok ? payload.error : undefined}
            >
              {summary && (
                <>
                  <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-slate-900 dark:text-slate-100 font-bold text-base">{summary.count}</span>{' '}
                    fresh · {summary.source_name}
                  </p>
                  {entries.length === 0 ? (
                    <p className="text-mini font-mono text-slate-500">No fresh entries.</p>
                  ) : (
                    <ul className="space-y-1.5 mt-1">
                      {entries.map((e, i) => {
                        const matched = watchHits(`${e.value} ${e.context ?? ''}`, watchlist);
                        return (
                          <li
                            key={`${e.type}-${e.value}-${i}`}
                            className="flex items-baseline gap-2 text-mini font-mono py-0.5"
                          >
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                                matched.length > 0 ? 'bg-violet-500' : 'bg-transparent'
                              }`}
                              aria-label={matched.length > 0 ? `watchlist match: ${matched.join(', ')}` : undefined}
                              title={matched.length > 0 ? `watchlist match: ${matched.join(', ')}` : undefined}
                            />
                            <span
                              className={`text-micro uppercase tracking-wider px-1 rounded border shrink-0 ${typeBadge(e.type)}`}
                            >
                              {e.type}
                            </span>
                            {c.pivot ? (
                              <Link
                                to={c.pivot(e)}
                                className="truncate text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 flex-1 min-w-0"
                                title={e.value}
                              >
                                {e.value}
                              </Link>
                            ) : (
                              <code
                                className="truncate text-slate-700 dark:text-slate-300 flex-1 min-w-0"
                                title={e.value}
                              >
                                {e.value}
                              </code>
                            )}
                            <span className="text-slate-500 shrink-0">{shortRel(e.timestamp)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </SnapshotCard>
          );
        })}
      </div>
    </section>
  );
}
