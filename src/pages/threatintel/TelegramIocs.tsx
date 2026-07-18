import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { RefreshCw, Shield, Hash, Globe, FileText, AlertTriangle, ExternalLink } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { DataState } from '../../components/DataState';
import { sanitizeUrl } from '../../lib/sanitize-url';

interface LeakEntry {
  id: number;
  channel_handle: string;
  message_link: string | null;
  message_text: string | null;
  leak_type: string;
  credential_count: number;
  domains_found: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  discovered_at: string;
}

interface Ioc {
  type: 'hash' | 'ipv4' | 'domain' | 'url' | 'cve';
  value: string;
}

interface CorrelatedIoc {
  value: string;
  kind: 'ip' | 'url' | 'domain' | 'hash';
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
    by_kind: { ip: number; url: number; domain: number; hash: number };
  };
  ips: CorrelatedIoc[];
  urls: CorrelatedIoc[];
  domains: CorrelatedIoc[];
  hashes: CorrelatedIoc[];
}

// Re-implement the IOC extraction rules client-side so the panel
// doesn't need a separate API. These mirror `api/src/lib/telegram-ioc-extract.ts`.
const MD5_RE = /\b[a-fA-F0-9]{32}\b/g;
const SHA1_RE = /\b[a-fA-F0-9]{40}\b/g;
const SHA256_RE = /\b[a-fA-F0-9]{64}\b/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const CVE_RE = /\bCVE-\d{4}-\d{4,}\b/gi;
const URL_RE = /https?:\/\/[^\s<>"')]+/gi;

function looksLikeHash(s: string, minD: number, minL: number): boolean {
  const digits = (s.match(/\d/g) || []).length;
  const letters = (s.match(/[a-fA-F]/g) || []).length;
  return digits >= minD && letters >= minL;
}

function extractIocs(row: LeakEntry): Ioc[] {
  const out: Ioc[] = [];
  const seen = new Set<string>();
  const text = row.message_text ?? '';
  function push(t: Ioc['type'], v: string): boolean {
    const k = `${t}:${v.toLowerCase()}`;
    if (seen.has(k)) return false;
    seen.add(k);
    out.push({ type: t, value: v });
    return out.length >= 50;
  }
  for (const m of text.match(MD5_RE) ?? []) {
    if (looksLikeHash(m, 3, 3)) push('hash', m.toLowerCase());
  }
  for (const m of text.match(SHA1_RE) ?? []) {
    if (looksLikeHash(m, 4, 4)) push('hash', m.toLowerCase());
  }
  for (const m of text.match(SHA256_RE) ?? []) {
    if (looksLikeHash(m, 6, 6)) push('hash', m.toLowerCase());
  }
  for (const m of text.match(CVE_RE) ?? []) {
    push('cve', m.toUpperCase());
  }
  for (const m of text.match(IPV4_RE) ?? []) {
    if (m.split('.').every((p) => Number(p) >= 0 && Number(p) <= 255)) push('ipv4', m);
  }
  if (row.domains_found) {
    try {
      const arr = JSON.parse(row.domains_found);
      if (Array.isArray(arr)) {
        for (const d of arr) {
          if (typeof d === 'string' && d.length > 0) push('domain', d.toLowerCase());
        }
      }
    } catch (_catchErr) {
      console.error('push failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* skip */
    }
  }
  for (const u of text.match(URL_RE) ?? []) {
    push('url', u.replace(/[.,;:!?)]+$/, ''));
  }
  return out;
}

const SEVERITY_TONE: Record<LeakEntry['severity'], string> = {
  critical: 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  high: 'border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  low: 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500',
};

const IOC_TYPE_TONE: Record<Ioc['type'], string> = {
  hash: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  ipv4: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  domain: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  url: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  cve: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

const IOC_ICON: Record<Ioc['type'], JSX.Element> = {
  hash: <Hash size={11} />,
  ipv4: <Shield size={11} />,
  domain: <Globe size={11} />,
  url: <FileText size={11} />,
  cve: <AlertTriangle size={11} />,
};

export default function TelegramIocs(): JSX.Element {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'pipeline';
  const [leakEntries, setLeakEntries] = useState<LeakEntry[]>([]);
  const [leakLoading, setLeakLoading] = useState(true);
  const [leakError, setLeakError] = useState<string | null>(null);
  const [leakRefreshKey, setLeakRefreshKey] = useState(0);

  const [correlation, setCorrelation] = useState<CorrelationResponse | null>(null);
  const [corrLoading, setCorrLoading] = useState(true);
  const [corrError, setCorrError] = useState<string | null>(null);
  const [corrRefreshKey, setCorrRefreshKey] = useState(0);

  // Fetch the most recent 50 leak entries from D1.
  useEffect(() => {
    let cancelled = false;
    setLeakLoading(true);
    setLeakError(null);
    const params = new URLSearchParams();
    params.set('limit', '50');
    fetch(`/api/v1/telegram-leaks/search?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ entries: LeakEntry[] }>;
      })
      .then((d) => {
        if (!cancelled) setLeakEntries(d.entries ?? []);
      })
      .catch((e) => {
        if (!cancelled) setLeakError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLeakLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leakRefreshKey]);

  // Fetch the cross-source IOC correlation view (cached 1h).
  useEffect(() => {
    let cancelled = false;
    setCorrLoading(true);
    setCorrError(null);
    fetch('/api/v1/ioc-correlation')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<CorrelationResponse>;
      })
      .then((d) => {
        if (!cancelled) setCorrelation(d);
      })
      .catch((e) => {
        if (!cancelled) setCorrError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setCorrLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [corrRefreshKey]);

  // Aggregate the IOCs we extracted from the leak entries, bucketed by
  // type for the left-hand "pipeline view" and de-duplicated across rows.
  const aggregatedIocs = useMemo(() => {
    const map = new Map<string, Ioc & { sources: Set<string> }>();
    for (const row of leakEntries) {
      const entries = extractIocs(row);
      for (const e of entries) {
        const k = `${e.type}:${e.value.toLowerCase()}`;
        const existing = map.get(k);
        if (existing) {
          existing.sources.add(row.channel_handle);
        } else {
          map.set(k, { ...e, sources: new Set([row.channel_handle]) });
        }
      }
    }
    return Array.from(map.values());
  }, [leakEntries]);

  // Filtered cross-source view: IOCs that include `telegram-leak` in
  // their source list. These are the highest-signal items in the
  // consensus — Telegram AND at least one other source agreed on them.
  const telegramCorrelated = useMemo(() => {
    if (!correlation) return [];
    const buckets: Array<{ kind: 'ip' | 'url' | 'domain' | 'hash'; list: CorrelatedIoc[] }> = [
      { kind: 'hash', list: correlation.hashes },
      { kind: 'ip', list: correlation.ips },
      { kind: 'url', list: correlation.urls },
      { kind: 'domain', list: correlation.domains },
    ];
    const out: { kind: CorrelatedIoc['kind']; ioc: CorrelatedIoc }[] = [];
    for (const b of buckets) {
      for (const ioc of b.list) {
        if (ioc.sources.includes('telegram-leak')) {
          out.push({ kind: b.kind, ioc });
        }
      }
    }
    return out;
  }, [correlation]);

  // Source row: highlight the telegram-leak entry in the consensus source list.
  const tgSource = correlation?.sources.find((s) => s.id === 'telegram-leak');
  const sourceCount = correlation?.sources.length ?? 0;

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Shield size={28} />}
      title="Telegram IOC Pipeline"
      description="End-to-end view of how Telegram-leaked IOCs flow into the cross-source consensus. Source #25 in the platform's IOC fan-out."
    >
      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard
          icon={<FileText size={14} />}
          label="Leak entries (50 latest)"
          value={leakLoading ? '…' : String(leakEntries.length)}
          sub={leakError ? 'fetch failed' : 'telegram_leak_entries'}
          tone="text-sky-700 dark:text-sky-300"
        />
        <KpiCard
          icon={<Hash size={14} />}
          label="Telegram-derived IOCs"
          value={corrLoading ? '…' : String(aggregatedIocs.length)}
          sub={`from ${leakEntries.length} leak rows`}
          tone="text-violet-700 dark:text-violet-300"
        />
        <KpiCard
          icon={<Shield size={14} />}
          label="Telegram-leak in consensus"
          value={corrLoading ? '…' : tgSource ? `${tgSource.count} rows` : '—'}
          sub={`${sourceCount} sources total · 7-day window`}
          tone="text-rose-700 dark:text-rose-300"
        />
        <KpiCard
          icon={<ExternalLink size={14} />}
          label="IOCs in 2+ sources"
          value={corrLoading ? '…' : String(telegramCorrelated.filter((c) => c.ioc.source_count >= 2).length)}
          sub="consensus matches with telegram-leak"
          tone="text-emerald-700 dark:text-emerald-300"
        />
      </div>

      {/* Refresh controls */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => {
            setLeakRefreshKey((k) => k + 1);
            setCorrRefreshKey((k) => k + 1);
          }}
          className="text-mini font-mono px-2.5 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1"
        >
          <RefreshCw size={11} /> refresh both
        </button>
        <span className="text-micro font-mono text-slate-500">leaks: 5min cache · correlation: 1h cache</span>
      </div>

      {/* Sub-tabs */}
      <nav
        className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))] mb-4"
        aria-label="Telegram IOC pipeline views"
      >
        <Link
          to="/threatintel/telegram-iocs?tab=pipeline"
          className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${
            tab === 'pipeline'
              ? 'border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Pipeline view
        </Link>
        <Link
          to="/threatintel/telegram-iocs?tab=consensus"
          className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${
            tab === 'consensus'
              ? 'border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Consensus matches ({telegramCorrelated.length})
        </Link>
        <Link
          to="/threatintel/telegram-iocs?tab=sources"
          className={`border-b-2 px-3 py-2 font-mono text-sm font-semibold transition-colors ${
            tab === 'sources'
              ? 'border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          All sources ({sourceCount})
        </Link>
      </nav>

      {tab === 'pipeline' && (
        <PipelineView
          leakEntries={leakEntries}
          aggregatedIocs={aggregatedIocs}
          loading={leakLoading}
          error={leakError}
        />
      )}
      {tab === 'consensus' && <ConsensusView matches={telegramCorrelated} loading={corrLoading} error={corrError} />}
      {tab === 'sources' && <SourcesView correlation={correlation} loading={corrLoading} error={corrError} />}
    </DataPageLayout>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: JSX.Element;
  label: string;
  value: string;
  sub?: string;
  tone: string;
}): JSX.Element {
  return (
    <div className="surface-card p-4">
      <div className={`flex items-center gap-2 text-xs font-mono mb-1 ${tone}`}>
        {icon} {label}
      </div>
      <p className="text-2xl font-display font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="text-micro font-mono text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function PipelineView({
  leakEntries,
  aggregatedIocs,
  loading,
  error,
}: {
  leakEntries: LeakEntry[];
  aggregatedIocs: Array<Ioc & { sources: Set<string> }>;
  loading: boolean;
  error: string | null;
}): JSX.Element {
  if (loading) {
    return (
      <DataState loading rows={4}>
        <></>
      </DataState>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 font-mono text-sm text-rose-700 dark:text-rose-300">
        {error}
      </div>
    );
  }
  if (leakEntries.length === 0) {
    return (
      <p className="font-mono text-sm text-slate-500">
        No leak entries yet. Telegram messages from monitored channels flow through the hourly cron
        (`telegram-leak-scanner`) and the leak entries land here.
      </p>
    );
  }

  // Bucket the aggregated IOCs for a clean summary at the top.
  const byType = {
    hash: aggregatedIocs.filter((i) => i.type === 'hash'),
    ipv4: aggregatedIocs.filter((i) => i.type === 'ipv4'),
    domain: aggregatedIocs.filter((i) => i.type === 'domain'),
    url: aggregatedIocs.filter((i) => i.type === 'url'),
    cve: aggregatedIocs.filter((i) => i.type === 'cve'),
  };

  return (
    <div className="space-y-6">
      {/* IOC summary */}
      <section className="surface-card p-5">
        <h2 className="font-display font-semibold text-base mb-3">Extracted IOCs (last 50 leak rows)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm font-mono">
          <TypePill label="Hashes" value={byType.hash.length} tone="text-violet-700 dark:text-violet-300" />
          <TypePill label="IPv4" value={byType.ipv4.length} tone="text-rose-700 dark:text-rose-300" />
          <TypePill label="Domains" value={byType.domain.length} tone="text-sky-700 dark:text-sky-300" />
          <TypePill label="URLs" value={byType.url.length} tone="text-amber-700 dark:text-amber-300" />
          <TypePill label="CVEs" value={byType.cve.length} tone="text-emerald-700 dark:text-emerald-300" />
        </div>
      </section>

      {/* Leak entry list */}
      <section>
        <h2 className="font-display font-semibold text-base mb-3">Leak entries → IOCs</h2>
        <ul className="space-y-3">
          {leakEntries.map((row) => {
            const iocs = extractIocs(row);
            if (iocs.length === 0) return null;
            return (
              <li key={row.id} className="surface-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
                      @{row.channel_handle}
                    </span>
                    <span
                      className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${SEVERITY_TONE[row.severity]}`}
                    >
                      {row.severity}
                    </span>
                    <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500">
                      {row.leak_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-micro font-mono text-slate-500">
                    <span>{new Date(row.discovered_at).toLocaleString()}</span>
                    {row.message_link && (
                      <a
                        href={sanitizeUrl(row.message_link)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                      >
                        source <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </div>
                {row.message_text && (
                  <p className="text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed line-clamp-2 mb-3">
                    {row.message_text}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {iocs.map((i) => (
                    <span
                      key={`${row.id}:${i.type}:${i.value}`}
                      className={`text-micro font-mono px-1.5 py-0.5 rounded border ${IOC_TYPE_TONE[i.type]} inline-flex items-center gap-1`}
                      title={i.value}
                    >
                      {IOC_ICON[i.type]}
                      {i.value.length > 32 ? i.value.slice(0, 32) + '…' : i.value}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function ConsensusView({
  matches,
  loading,
  error,
}: {
  matches: Array<{ kind: CorrelatedIoc['kind']; ioc: CorrelatedIoc }>;
  loading: boolean;
  error: string | null;
}): JSX.Element {
  if (loading) {
    return (
      <DataState loading rows={4}>
        <></>
      </DataState>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 font-mono text-sm text-rose-700 dark:text-rose-300">
        {error}
      </div>
    );
  }
  if (matches.length === 0) {
    return (
      <p className="font-mono text-sm text-slate-500">
        No IOC currently in the cross-source consensus mentions{' '}
        <code className="text-xs bg-slate-100 dark:bg-[rgb(var(--surface-300))] px-1 py-0.5 rounded">
          telegram-leak
        </code>
        . Once a hash / IP / domain / URL appears in both a Telegram leak entry and at least one upstream feed, it will
        show up here.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {matches.map((m) => (
        <li key={`${m.kind}:${m.ioc.value}`} className="surface-card p-3 flex flex-wrap items-center gap-3">
          <span
            className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${IOC_TYPE_TONE[m.kind === 'ip' ? 'ipv4' : m.kind]} shrink-0`}
          >
            {m.kind}
          </span>
          <code className="font-mono text-sm text-slate-900 dark:text-slate-100 truncate flex-1 min-w-0">
            {m.ioc.value}
          </code>
          <span className="text-micro font-mono text-slate-500">
            {m.ioc.source_count} sources: {m.ioc.sources.join(', ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SourcesView({
  correlation,
  loading,
  error,
}: {
  correlation: CorrelationResponse | null;
  loading: boolean;
  error: string | null;
}): JSX.Element {
  if (loading) {
    return (
      <DataState loading rows={6}>
        <></>
      </DataState>
    );
  }
  if (error || !correlation) {
    return (
      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 font-mono text-sm text-rose-700 dark:text-rose-300">
        {error ?? 'No correlation data.'}
      </div>
    );
  }
  return (
    <div>
      <p className="text-sm font-mono text-slate-600 dark:text-slate-300 mb-3">
        Every source the cross-source IOC pipeline pulls from.{' '}
        <span className="font-semibold text-rose-600 dark:text-rose-400">telegram-leak</span> is the newest (added
        Sprint 2 §16). Total: {correlation.sources.length} sources, scanning{' '}
        {correlation.totals.indicators_scanned.toLocaleString()} indicators, surfacing{' '}
        {correlation.totals.correlated_indicators.toLocaleString()} correlated IOCs.
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {correlation.sources.map((s) => (
          <li
            key={s.id}
            className={`rounded-xl border p-3 font-mono text-sm flex items-center justify-between gap-2 ${
              s.id === 'telegram-leak'
                ? 'border-rose-500/50 bg-rose-500/10'
                : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]'
            }`}
          >
            <span className="truncate">
              {s.id === 'telegram-leak' && <span className="text-rose-600 dark:text-rose-400 mr-1">★</span>}
              {s.id}
            </span>
            <span className="text-micro font-mono text-slate-500 shrink-0">
              {s.ok ? `${s.count.toLocaleString()} items` : 'unavailable'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TypePill({ label, value, tone }: { label: string; value: number; tone: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] p-3">
      <p className={`text-xs font-mono ${tone}`}>{label}</p>
      <p className="text-2xl font-display font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}
