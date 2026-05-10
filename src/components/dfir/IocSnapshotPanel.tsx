import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Link2, FileWarning, Crosshair, Fish, ExternalLink } from 'lucide-react';

/**
 * Live IOC snapshot for /dfir/threat-map.
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

function shortRel(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const ageS = Math.max(0, (Date.now() - t) / 1000);
  if (ageS < 60) return 'now';
  if (ageS < 3600) return `${Math.round(ageS / 60)}m ago`;
  if (ageS < 86400) return `${Math.round(ageS / 3600)}h ago`;
  return `${Math.round(ageS / 86400)}d ago`;
}

interface CardSpec {
  key: string;
  title: string;
  Icon: typeof Link2;
  accentClass: string;
  accentText: string;
  /** Pivot URL when clicking an entry value. */
  pivot?: (e: IocEntry) => string;
}

const CARDS: CardSpec[] = [
  {
    key: 'urlhaus',
    title: 'Malicious URLs',
    Icon: Link2,
    accentClass: 'border-rose-500/30',
    accentText: 'text-rose-600 dark:text-rose-400',
    pivot: (e) => `/dfir/url-preview?url=${encodeURIComponent(e.value)}`,
  },
  {
    key: 'malwarebazaar',
    title: 'Malware samples',
    Icon: FileWarning,
    accentClass: 'border-orange-500/30',
    accentText: 'text-orange-600 dark:text-orange-400',
    pivot: (e) => `/dfir/ioc-check?q=${encodeURIComponent(e.value)}`,
  },
  {
    key: 'threatfox',
    title: 'IOCs by type',
    Icon: Crosshair,
    accentClass: 'border-amber-500/30',
    accentText: 'text-amber-600 dark:text-amber-400',
    pivot: (e) => `/dfir/ioc-check?q=${encodeURIComponent(e.value)}`,
  },
  {
    key: 'openphish',
    title: 'Phishing URLs',
    Icon: Fish,
    accentClass: 'border-fuchsia-500/30',
    accentText: 'text-fuchsia-600 dark:text-fuchsia-400',
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
      return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300';
    case 'hash':
      return 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300';
    case 'cve':
      return 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300';
    default:
      return 'border-slate-300 dark:border-slate-700 text-slate-500';
  }
}

export function IocSnapshotPanel(): JSX.Element {
  const [data, setData] = useState<IocSnapshotResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/v1/ioc-snapshot');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as IocSnapshotResp;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalEntries = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.sources).reduce((n, s) => n + (s.data?.count ?? 0), 0);
  }, [data]);

  return (
    <section className="mt-12 mb-6">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-display font-bold text-xl">Live IOC feeds</h2>
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-500">
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
            <div
              key={c.key}
              className={`rounded-2xl border ${c.accentClass} bg-white dark:bg-slate-900 p-4 flex flex-col min-h-[200px]`}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1 flex-wrap">
                <h3 className="font-display font-semibold text-sm inline-flex items-center gap-1.5">
                  <c.Icon size={14} className={c.accentText} /> {c.title}
                </h3>
                <a
                  href={`https://abuse.ch/${c.key === 'openphish' ? '' : c.key + '/'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
                >
                  source <ExternalLink size={9} />
                </a>
              </div>

              {payload && !payload.ok && (
                <p className="text-[11px] font-mono text-rose-500">load error: {payload.error}</p>
              )}

              {!payload && !err && <p className="text-[11px] font-mono text-slate-500">loading…</p>}

              {summary && (
                <>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-2">
                    <span className="text-slate-900 dark:text-slate-100 font-bold text-base">{summary.count}</span>{' '}
                    fresh · {summary.source_name}
                  </p>
                  {entries.length === 0 ? (
                    <p className="text-[11px] font-mono text-slate-500">No fresh entries.</p>
                  ) : (
                    <ul className="space-y-1.5 mt-1">
                      {entries.map((e, i) => (
                        <li
                          key={`${e.type}-${e.value}-${i}`}
                          className="flex items-baseline gap-2 text-[11px] font-mono py-0.5"
                        >
                          <span
                            className={`text-[9px] uppercase tracking-wider px-1 rounded border shrink-0 ${typeBadge(e.type)}`}
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
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
