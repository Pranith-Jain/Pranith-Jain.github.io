import { useEffect, useMemo, useState } from 'react';
import { IocChip } from '../../components/dfir/IocChip';
import { relativeAgo } from '../../lib/relativeTime';
const shortRel = (iso?: string) => relativeAgo(iso, 'no timestamp');
import { sanitizeUrl } from '../../lib/sanitize-url';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, ExternalLink, Radio, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useLastVisit, isNewSince } from '../../hooks';
import { DataState } from '../../components/DataState';
import { AdmiraltyBadge } from '../../components/dfir/AdmiraltyBadge';
import { gradeForLiveIoc } from '../../lib/dfir/admiralty-quick';
import { LiveFreshnessPill } from '../../components/LiveFreshnessPill';

type IocKind = 'ip' | 'url' | 'domain' | 'hash';

interface LiveIoc {
  value: string;
  kind: IocKind;
  source: string;
  reporter?: string;
  context?: string;
  reference_url?: string;
  observed_at?: string;
}

interface LiveSource {
  id: string;
  ok: boolean;
  count: number;
  /** ISO 8601 newest per-entry observation timestamp from this source. */
  newest_observation?: string;
}

interface LiveIocsResponse {
  generated_at: string;
  sources: LiveSource[];
  total: number;
  items: LiveIoc[];
}

type Freshness = 'fresh' | 'recent' | 'stale' | 'no-timestamp';

/** Bucket a per-source newest-observation timestamp into a freshness tier. */
function sourceFreshness(iso?: string): Freshness {
  if (!iso) return 'no-timestamp';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'no-timestamp';
  const ageH = (Date.now() - t) / 3600_000;
  if (ageH <= 6) return 'fresh';
  if (ageH <= 48) return 'recent';
  return 'stale';
}

const FRESHNESS_DOT: Record<Freshness, { cls: string; label: string }> = {
  fresh: { cls: 'bg-emerald-500', label: 'fresh (<6h)' },
  recent: { cls: 'bg-sky-500', label: 'recent (<48h)' },
  stale: { cls: 'bg-rose-500', label: 'stale (>48h)' },
  'no-timestamp': { cls: 'bg-slate-400', label: 'no per-entry timestamp' },
};

const KIND_PILL: Record<IocKind, string> = {
  ip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  url: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  domain: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  hash: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

const SOURCE_PILL: Record<string, string> = {
  tweetfeed: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  'sans-isc': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'c2-intel': 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  urlhaus: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  threatfox: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  'emerging-threats': 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'otx-reputation': 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  malwarebazaar: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
  phishtank: 'border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  openphish: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  'sslbl-c2': 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  botvrij: 'border-lime-500/40 bg-lime-500/10 text-lime-700 dark:text-lime-300',
  'andreafortuna-defacements': 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  binarydefense: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  'tor-exit': 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  'avanzato-c2': 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  'cps-collected': 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  greensnow: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'blocklist-de': 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  cinsscore: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'bbcan177-ips': 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  'bbcan177-dnsbl': 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  'domains-blacklist': 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  nocoin: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'monero-miner': 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  'botvrij-hostnames': 'border-lime-500/40 bg-lime-500/10 text-lime-700 dark:text-lime-300',
  'botvrij-urls': 'border-lime-500/40 bg-lime-500/10 text-lime-700 dark:text-lime-300',
  'botvrij-ips': 'border-lime-500/40 bg-lime-500/10 text-lime-700 dark:text-lime-300',
  hancitor: 'border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  darklist: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  'bruteforce-blocker': 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

export default function LiveIocs(): JSX.Element {
  const [data, setData] = useState<LiveIocsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<Set<IocKind>>(new Set());
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());
  const [newOnly, setNewOnly] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const { previous: lastVisit, markVisited } = useLastVisit('live-iocs');

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/v1/live-iocs', { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<LiveIocsResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: { name?: string; message?: string }) => {
        if (cancelled || e.name === 'AbortError') return;
        setError(e.message ?? 'failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    if (!data) return [] as LiveIoc[];
    const q = query.trim().toLowerCase();
    return data.items.filter((it) => {
      if (kindFilter.size > 0 && !kindFilter.has(it.kind)) return false;
      if (sourceFilter.size > 0 && !sourceFilter.has(it.source)) return false;
      if (newOnly && !isNewSince(it.observed_at, lastVisit)) return false;
      if (!q) return true;
      return (
        it.value.toLowerCase().includes(q) ||
        (it.context ?? '').toLowerCase().includes(q) ||
        (it.reporter ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, query, kindFilter, sourceFilter, newOnly, lastVisit]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [query, kindFilter, sourceFilter, newOnly]);

  const newCount = useMemo(() => {
    if (!data || !lastVisit) return 0;
    return data.items.filter((it) => isNewSince(it.observed_at, lastVisit)).length;
  }, [data, lastVisit]);

  useEffect(() => {
    if (!data) return;
    const id = window.setTimeout(markVisited, 1500);
    return () => window.clearTimeout(id);
  }, [data, markVisited]);

  const kindCounts = useMemo(() => {
    const m: Record<IocKind, number> = { ip: 0, url: 0, domain: 0, hash: 0 };
    if (!data) return m;
    for (const it of data.items) m[it.kind] += 1;
    return m;
  }, [data]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  const toggleKind = (k: IocKind) =>
    setKindFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const toggleSource = (s: string) =>
    setSourceFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Radio size={28} className="text-brand-600 dark:text-brand-400" /> Live IOC stream
          <LiveFreshnessPill tone="live" ago={data ? shortRel(data.generated_at) : undefined} className="ml-1" />
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-2 max-w-3xl leading-relaxed">
          A chronological firehose of individual indicators, each carrying a reporter handle, source feed, and
          first-observed timestamp. /correlation answers "what's in 2+ feeds"; this page answers "what's freshly
          observed and by whom."
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-6">
          Sources: TweetFeed, SANS ISC, C2IntelFeeds, Emerging Threats compromised-ips, AlienVault OTX reputation,
          URLhaus, ThreatFox, MalwareBazaar, PhishTank, Binary Defense, Tor Exit Nodes, Avanzato C2, CPS Collected,
          GreenSnow, Blocklist.de, CINSscore, AndreaFortuna Defacements, BBcan177 IPs/DNSBL, Domains Blacklist, NoCoin,
          Monero Miner, Botvrij hostnames/URLs/IPs, Hancitor, Darklist, Brute Force Blocker.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by indicator, reporter, or context…"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Filter IOC stream"
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
              title={`${newCount} indicator${newCount === 1 ? '' : 's'} observed after your previous visit${lastVisit ? ` (${new Date(lastVisit).toLocaleString()})` : ''}`}
            >
              <Sparkles size={12} /> {newCount} new
            </button>
          )}
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
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                className={`text-[11px] font-mono px-2 py-1 rounded border ${
                  active ? KIND_PILL[k] : 'border-slate-300 dark:border-slate-700 text-slate-500'
                }`}
              >
                {k} <span className="opacity-70">· {kindCounts[k]}</span>
              </button>
            );
          })}
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[11px] font-mono text-slate-500 mr-1">sources:</span>
            {data.sources.map((s) => {
              const active = sourceFilter.has(s.id);
              const pillCls = SOURCE_PILL[s.id] ?? 'border-slate-300 dark:border-slate-700 text-slate-500';
              const fresh = sourceFreshness(s.newest_observation);
              const dot = FRESHNESS_DOT[fresh];
              const newestRel = s.newest_observation ? shortRel(s.newest_observation) : null;
              const tooltip = s.ok
                ? newestRel
                  ? `${s.count} items from ${s.id} · ${dot.label} · newest ${newestRel}`
                  : `${s.count} items from ${s.id} · ${dot.label}`
                : `${s.id} unreachable`;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSource(s.id)}
                  disabled={!s.ok}
                  className={`text-[11px] font-mono px-2 py-1 rounded border inline-flex items-center gap-1.5 ${
                    active
                      ? pillCls
                      : s.ok
                        ? 'border-slate-300 dark:border-slate-700 text-slate-500'
                        : 'border-slate-300 dark:border-slate-700 text-slate-400 opacity-50 cursor-not-allowed'
                  }`}
                  title={tooltip}
                >
                  {s.ok && (
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot.cls}`} aria-label={dot.label} />
                  )}
                  {s.id} <span className="opacity-70">· {s.count}</span>
                </button>
              );
            })}
            {(sourceFilter.size > 0 || kindFilter.size > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSourceFilter(new Set());
                  setKindFilter(new Set());
                }}
                className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline ml-2"
              >
                clear
              </button>
            )}
          </div>
        )}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] font-mono text-slate-500">
              <span>freshness:</span>
              {(['fresh', 'recent', 'stale', 'no-timestamp'] as const).map((f) => (
                <span key={f} className="inline-flex items-center gap-1">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${FRESHNESS_DOT[f].cls}`} />
                  {FRESHNESS_DOT[f].label}
                </span>
              ))}
            </div>
            <p className="text-[11px] font-mono text-slate-500 mt-3">
              Showing page{' '}
              <span className="text-slate-700 dark:text-slate-300">
                {page}/{totalPages}
              </span>{' '}
              · <span className="text-slate-700 dark:text-slate-300">{pageItems.length}</span> of{' '}
              <span className="text-slate-700 dark:text-slate-300">{filtered.length}</span> filtered · {data.total}{' '}
              total · snapshot <span className="text-slate-700 dark:text-slate-300">{shortRel(data.generated_at)}</span>
            </p>
          </>
        )}
      </section>

      <DataState
        loading={loading}
        error={error}
        empty={filtered.length === 0}
        emptyLabel={
          query || kindFilter.size > 0 || sourceFilter.size > 0
            ? 'No indicators match the current filter.'
            : 'No indicators in the current snapshot. The cron repopulates this every 15 minutes — click refresh to re-pull.'
        }
        onRetry={() => setRefreshKey((k) => k + 1)}
        rows={8}
      >
        <ul className="space-y-2">
          {pageItems.map((it, i) => {
            const sourcePill = SOURCE_PILL[it.source] ?? 'border-slate-300 dark:border-slate-700 text-slate-500';
            return (
              <li
                key={`${it.source}:${it.value}:${i}`}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 flex items-center gap-3"
              >
                <span
                  className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${KIND_PILL[it.kind]} shrink-0`}
                >
                  {it.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <IocChip value={it.value} size="sm" bare truncate={56} className="min-w-0" />
                    {it.reference_url && (
                      <a
                        href={sanitizeUrl(it.reference_url) || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-slate-400 hover:text-brand-500 transition-colors shrink-0"
                        aria-label="open source post"
                        title="open source post"
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded border ${sourcePill}`}>{it.source}</span>
                    <AdmiraltyBadge admiralty={gradeForLiveIoc(it.source, it.kind)} compact />
                    {it.reporter && <span className="text-slate-600 dark:text-slate-400">{it.reporter}</span>}
                    {it.context && (
                      <span className="text-slate-400 italic truncate max-w-[40ch]" title={it.context}>
                        · {it.context}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className="shrink-0 text-right text-[11px] font-mono text-slate-500"
                  title={it.observed_at ?? 'no timestamp'}
                >
                  {shortRel(it.observed_at)}
                </div>
              </li>
            );
          })}
        </ul>
      </DataState>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-xs font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-30 hover:border-brand-500/40"
          >
            ← prev
          </button>
          <span className="text-xs font-mono text-slate-500 px-2">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="text-xs font-mono px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-30 hover:border-brand-500/40"
          >
            next →
          </button>
        </div>
      )}
    </div>
  );
}
