import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, GitBranchPlus, RefreshCw, Search, Sparkles, Copy, Check } from 'lucide-react';
import { useLastVisit, isNewSince } from '../../hooks';
import { DataState } from '../../components/DataState';

type IocKind = 'ip' | 'url' | 'domain' | 'hash';

interface CorrelatedIoc {
  value: string;
  kind: IocKind;
  source_count: number;
  sources: string[];
  context?: string;
  last_seen?: string;
}

interface CorrelationResponse {
  generated_at: string;
  sources: { id: string; ok: boolean; count: number }[];
  totals: {
    indicators_scanned: number;
    correlated_indicators: number;
    by_kind: Record<IocKind, number>;
  };
  ips: CorrelatedIoc[];
  urls: CorrelatedIoc[];
  domains: CorrelatedIoc[];
  hashes: CorrelatedIoc[];
}

const KIND_LABEL: Record<IocKind, string> = {
  ip: 'IPs',
  url: 'URLs',
  domain: 'Domains',
  hash: 'Hashes',
};

const KIND_PILL: Record<IocKind, string> = {
  ip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  url: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  domain: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  hash: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

function shortRel(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function confidenceLabel(n: number): { label: string; cls: string } {
  if (n >= 5) return { label: 'very high', cls: 'text-rose-700 dark:text-rose-300' };
  if (n >= 4) return { label: 'high', cls: 'text-amber-700 dark:text-amber-300' };
  if (n >= 3) return { label: 'medium', cls: 'text-sky-700 dark:text-sky-300' };
  return { label: 'low', cls: 'text-slate-600 dark:text-slate-400' };
}

type Freshness = 'fresh' | 'recent' | 'stale' | 'no-timestamp';

function freshness(iso?: string): Freshness {
  if (!iso) return 'no-timestamp';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'no-timestamp';
  const ageH = (Date.now() - t) / 3600_000;
  if (ageH <= 24) return 'fresh';
  if (ageH <= 24 * 7) return 'recent';
  return 'stale';
}

const FRESHNESS_PILL: Record<Freshness, { label: string; cls: string }> = {
  fresh: {
    label: 'fresh · <24h',
    cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  recent: {
    label: 'recent · <7d',
    cls: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  stale: {
    label: 'stale · >7d',
    cls: 'border-slate-400/40 bg-slate-200/40 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400',
  },
  'no-timestamp': {
    label: 'no upstream timestamp',
    cls: 'border-slate-300 dark:border-slate-700 text-slate-400',
  },
};

function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  const click = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      type="button"
      onClick={click}
      aria-label="copy indicator"
      className="text-slate-400 hover:text-brand-500 transition-colors shrink-0"
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function IocRow({ ioc }: { ioc: CorrelatedIoc }) {
  const conf = confidenceLabel(ioc.source_count);
  const fresh = freshness(ioc.last_seen);
  const freshPill = FRESHNESS_PILL[fresh];
  return (
    <li className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 flex items-center gap-3">
      <span
        className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${KIND_PILL[ioc.kind]} shrink-0`}
      >
        {ioc.kind}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] text-slate-900 dark:text-slate-100 truncate" title={ioc.value}>
            {ioc.value}
          </span>
          <CopyBtn value={ioc.value} />
        </div>
        <div className="text-[11px] font-mono text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
          <span
            className={`px-1.5 py-0.5 rounded border ${freshPill.cls}`}
            title={
              ioc.last_seen
                ? `last upstream timestamp: ${ioc.last_seen}`
                : 'this source class does not publish per-entry timestamps'
            }
          >
            {freshPill.label}
            {ioc.last_seen && fresh !== 'no-timestamp' && (
              <span className="ml-1 opacity-70">· {shortRel(ioc.last_seen)}</span>
            )}
          </span>
          {ioc.sources.map((s) => (
            <span
              key={s}
              className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            >
              {s}
            </span>
          ))}
          {ioc.context && (
            <span className="text-slate-400 italic" title={ioc.context}>
              · {ioc.context.length > 60 ? `${ioc.context.slice(0, 60)}…` : ioc.context}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display font-bold text-base text-slate-900 dark:text-slate-100">{ioc.source_count}</div>
        <div className={`text-[10px] font-mono uppercase tracking-wider ${conf.cls}`}>{conf.label}</div>
      </div>
    </li>
  );
}

export default function IocCorrelation(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<CorrelationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [kindFilter, setKindFilter] = useState<Set<IocKind>>(
    () => new Set((searchParams.get('kind')?.split(',').filter(Boolean) ?? []) as IocKind[])
  );
  const [freshFilter, setFreshFilter] = useState<Set<Freshness>>(
    () => new Set((searchParams.get('fresh')?.split(',').filter(Boolean) ?? []) as Freshness[])
  );
  const [newOnly, setNewOnly] = useState(searchParams.get('new') === '1');
  const [refreshKey, setRefreshKey] = useState(0);

  // Keep filter state in the URL so a curated view is shareable.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (query.trim()) out.set('q', query.trim());
        else out.delete('q');
        if (kindFilter.size > 0) out.set('kind', [...kindFilter].join(','));
        else out.delete('kind');
        if (freshFilter.size > 0) out.set('fresh', [...freshFilter].join(','));
        else out.delete('fresh');
        if (newOnly) out.set('new', '1');
        else out.delete('new');
        return out;
      },
      { replace: true }
    );
  }, [query, kindFilter, freshFilter, newOnly, setSearchParams]);
  const { previous: lastVisit, markVisited } = useLastVisit('ioc-correlation');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/v1/ioc-correlation')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<CorrelationResponse>;
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

  const flat = useMemo(() => {
    if (!data) return [] as CorrelatedIoc[];
    return [...data.ips, ...data.urls, ...data.domains, ...data.hashes];
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flat.filter((it) => {
      if (kindFilter.size > 0 && !kindFilter.has(it.kind)) return false;
      if (freshFilter.size > 0 && !freshFilter.has(freshness(it.last_seen))) return false;
      if (newOnly && !isNewSince(it.last_seen, lastVisit)) return false;
      if (!q) return true;
      return (
        it.value.toLowerCase().includes(q) ||
        it.sources.some((s) => s.includes(q)) ||
        (it.context ?? '').toLowerCase().includes(q)
      );
    });
  }, [flat, query, kindFilter, freshFilter, newOnly, lastVisit]);

  const newCount = useMemo(() => {
    if (!lastVisit) return 0;
    return flat.filter((it) => isNewSince(it.last_seen, lastVisit)).length;
  }, [flat, lastVisit]);

  useEffect(() => {
    if (!data) return;
    const id = window.setTimeout(markVisited, 1500);
    return () => window.clearTimeout(id);
  }, [data, markVisited]);

  const freshCounts = useMemo<Record<Freshness, number>>(() => {
    const out: Record<Freshness, number> = { fresh: 0, recent: 0, stale: 0, 'no-timestamp': 0 };
    for (const it of flat) out[freshness(it.last_seen)] += 1;
    return out;
  }, [flat]);

  const toggleKind = (k: IocKind) =>
    setKindFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const toggleFresh = (f: Freshness) =>
    setFreshFilter((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <GitBranchPlus size={28} className="text-brand-600 dark:text-brand-400" /> Cross-source IOC correlation
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          Indicators that appear in 2+ independent IOC feeds. A single feed can carry false positives; consensus across
          independent sources is what analysts trust. Higher source-count = higher confidence the indicator is currently
          malicious.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-6">
          Aggregated across 18 public IOC feeds: TweetFeed, SANS ISC, C2IntelFeeds, Emerging Threats, AlienVault OTX,
          BlocklistProject (ransomware + scam), the abuse.ch suite, Ipsum, CINS, and more.
        </p>
      </div>

      {data && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Correlated IPs</div>
            <div className="font-display font-bold text-xl">{data.totals.by_kind.ip}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Correlated URLs</div>
            <div className="font-display font-bold text-xl">{data.totals.by_kind.url}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Correlated domains</div>
            <div className="font-display font-bold text-xl">{data.totals.by_kind.domain}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Correlated hashes</div>
            <div className="font-display font-bold text-xl">{data.totals.by_kind.hash}</div>
          </div>
        </section>
      )}

      {/* Feed-health row — was buried at the bottom as a comma-separated
          run-on. If 5 feeds are offline the user had no way to know the
          corpus was degraded. Now: explicit per-feed dot + count + the
          aggregate "N of M online". */}
      {data && (
        <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-4">
          <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
              Feed health
            </h3>
            <span className="text-[11px] font-mono text-slate-500 tabular-nums">
              {data.sources.filter((s) => s.ok).length} of {data.sources.length} feeds online ·{' '}
              {data.totals.indicators_scanned.toLocaleString()} indicators scanned
            </span>
          </div>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
            {data.sources
              .slice()
              .sort((a, b) => Number(b.ok) - Number(a.ok) || b.count - a.count)
              .map((s) => (
                <li
                  key={s.id}
                  className={`flex items-center gap-2 text-[11px] font-mono px-2 py-1 rounded border ${
                    s.ok
                      ? 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950'
                      : 'border-rose-400/40 bg-rose-500/5 text-rose-700 dark:text-rose-300'
                  }`}
                  title={s.ok ? `${s.id}: ${s.count} indicators` : `${s.id}: offline`}
                >
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                      s.ok ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-rose-500 dark:bg-rose-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="truncate flex-1">{s.id}</span>
                  <span className="tabular-nums opacity-70">{s.ok ? s.count.toLocaleString() : 'off'}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by indicator value, source, or context…"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Filter IOCs"
            />
          </div>
          {newCount > 0 && (
            <button
              type="button"
              onClick={() => setNewOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border ${
                newOnly
                  ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/60'
              }`}
              title={`${newCount} indicator${newCount === 1 ? '' : 's'} with last_seen newer than your previous visit${lastVisit ? ` (${new Date(lastVisit).toLocaleString()})` : ''}`}
            >
              <Sparkles size={12} /> {newCount} new
            </button>
          )}
          <button
            type="button"
            onClick={() => downloadFilteredCsv(filtered)}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-brand-500/40 disabled:opacity-40"
            title="Download the currently filtered IOCs as CSV. Pasteable straight into a firewall blocklist."
          >
            <Download size={12} /> CSV
          </button>
          <a
            href="/api/v1/ioc-correlation/stix.json"
            download
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/60"
            title="Download STIX 2.1 bundle. Drops straight into MISP, OpenCTI, or a SIEM."
          >
            <Download size={12} /> STIX 2.1
          </a>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
          >
            <RefreshCw size={12} /> refresh
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <span className="text-[11px] font-mono text-slate-500 mr-1">kinds:</span>
          {(['ip', 'url', 'domain', 'hash'] as const).map((k) => {
            const active = kindFilter.has(k);
            const count = data?.totals.by_kind[k] ?? 0;
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                className={`text-[11px] font-mono px-2 py-1 rounded border ${
                  active ? KIND_PILL[k] : 'border-slate-300 dark:border-slate-700 text-slate-500'
                }`}
              >
                {KIND_LABEL[k]} <span className="opacity-70">· {count}</span>
              </button>
            );
          })}
          {kindFilter.size > 0 && (
            <button
              type="button"
              onClick={() => setKindFilter(new Set())}
              className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline ml-2"
            >
              clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-[11px] font-mono text-slate-500 mr-1">freshness:</span>
          {(['fresh', 'recent', 'stale', 'no-timestamp'] as const).map((f) => {
            const active = freshFilter.has(f);
            const pill = FRESHNESS_PILL[f];
            return (
              <button
                key={f}
                type="button"
                onClick={() => toggleFresh(f)}
                className={`text-[11px] font-mono px-2 py-1 rounded border ${
                  active ? pill.cls : 'border-slate-300 dark:border-slate-700 text-slate-500'
                }`}
              >
                {pill.label} <span className="opacity-70">· {freshCounts[f]}</span>
              </button>
            );
          })}
          {freshFilter.size > 0 && (
            <button
              type="button"
              onClick={() => setFreshFilter(new Set())}
              className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline ml-2"
            >
              clear
            </button>
          )}
        </div>
        {data && (
          <p className="text-[11px] font-mono text-slate-500 mt-3">
            Scanned{' '}
            <span className="text-slate-700 dark:text-slate-300">
              {data.totals.indicators_scanned.toLocaleString()}
            </span>{' '}
            indicators · correlated{' '}
            <span className="text-slate-700 dark:text-slate-300">{data.totals.correlated_indicators}</span> · snapshot{' '}
            <span className="text-slate-700 dark:text-slate-300">{shortRel(data.generated_at)}</span>
          </p>
        )}
      </section>

      <DataState
        loading={loading}
        error={error}
        empty={filtered.length === 0}
        emptyLabel={
          query || kindFilter.size > 0
            ? 'No correlated indicators match the current filter.'
            : 'No indicators currently appear in 2+ feeds. Either upstream feeds are degraded, or there is no current overlap.'
        }
        onRetry={() => setRefreshKey((k) => k + 1)}
        rows={8}
      >
        <ul className="space-y-2">
          {filtered.map((it) => (
            <IocRow key={`${it.kind}:${it.value}`} ioc={it} />
          ))}
        </ul>
      </DataState>

      {data && (
        <section className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
          <h3 className="font-display font-semibold text-sm mb-2">How to read this</h3>
          <ul className="text-[12px] font-mono text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
            <li>
              <span className="text-rose-700 dark:text-rose-300">very high (5+ sources)</span>: broad consensus, treat
              as confirmed malicious infra.
            </li>
            <li>
              <span className="text-amber-700 dark:text-amber-300">high (4 sources)</span>: strong signal across
              independent feeds.
            </li>
            <li>
              <span className="text-sky-700 dark:text-sky-300">medium (3 sources)</span>: worth blocking and tracking.
            </li>
            <li>
              <span className="text-slate-600 dark:text-slate-400">low (2 sources)</span>: corroborated, but verify
              before action.
            </li>
          </ul>
          {/* Feeds-queried run-on line removed 2026-05-14 — replaced by
              the dedicated "Feed health" panel above which shows per-feed
              status as a visual grid instead of comma-separated text. */}
        </section>
      )}
    </div>
  );
}

/**
 * CSV serialiser. Quotes any field that contains a comma, quote, or newline
 * and escapes inner quotes by doubling per RFC 4180. Works for the IOC
 * value/context fields which can contain commas (CIDR ranges) and quotes.
 */
function csvCell(s: string | number | undefined): string {
  if (s === undefined || s === null) return '';
  const v = String(s);
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function downloadFilteredCsv(rows: CorrelatedIoc[]): void {
  if (rows.length === 0) return;
  const header = ['value', 'kind', 'source_count', 'sources', 'last_seen', 'context'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.value),
        csvCell(r.kind),
        csvCell(r.source_count),
        csvCell(r.sources.join('; ')),
        csvCell(r.last_seen ?? ''),
        csvCell(r.context ?? ''),
      ].join(',')
    );
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.download = `ioc-correlation-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
