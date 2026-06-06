import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Radar, Activity, ShieldAlert, Zap, Database, ExternalLink } from 'lucide-react';
import { fetchJson } from '../../lib/fetch-json';
import { SocShell, SocKpi, SocSection, SocPanel, type SocTone } from '../../components/threatintel/soc/SocShell';
import { SocBar, SocDonut, type BarItem, type DonutSlice } from '../../components/threatintel/soc/SocCharts';
import { downloadCsv, dayKey } from '../../components/threatintel/soc/utils';

/* ─── Data shape (matches /api/v1/live-iocs) ───────────────────────── */

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
  newest_observation?: string;
  stale?: boolean;
}

interface LiveIocsResponse {
  generated_at: string;
  sources: LiveSource[];
  total: number;
  items: LiveIoc[];
  degraded?: boolean;
}

/* ─── Severity / criticality heuristic ─────────────────────────────── */

/**
 * Per-IOC criticality score, 0-100. Higher = more actionable.
 *
 * Source reputation (which upstream flagged it) is the dominant signal —
 * C2/ThreatFox/URLhaus sources carry stronger attribution than bulk
 * blocklists. Kinds matter too: IP/URL are network-side and immediately
 * blockable, hash requires endpoint response, domain is in between.
 *
 * Bucket the score into one of three "criticality" tiers the UI surfaces
 * as a donut slice.
 */
function iocCriticality(ioc: LiveIoc): number {
  let s = 0;
  // Source weight (0-60)
  const SRC: Record<string, number> = {
    'c2-intel': 60,
    'c2-intel-domains': 60,
    sslbl: 55,
    threatfox: 50,
    urlhaus: 45,
    malwarebazaar: 40,
    'sans-isc': 35,
    'otx-reputation': 30,
    tweetfeed: 25,
    'binary-defense': 22,
    'emerging-threats': 20,
    botvrij: 18,
    ipsum: 18,
    'blocklist-de': 15,
    cinsarmy: 12,
    openphish: 28,
    'phishing-army': 20,
    phishtank: 25,
    'af-defacements': 10,
    mythreatintel: 30,
  };
  s += SRC[ioc.source] ?? 20;
  // Kind weight (0-25)
  s += { ip: 25, url: 22, domain: 18, hash: 12 }[ioc.kind] ?? 10;
  // Context richness (0-15)
  if (ioc.context) s += 8;
  if (ioc.reporter && ioc.reporter !== '—') s += 4;
  if (ioc.reference_url) s += 3;
  return Math.min(100, s);
}

function criticalityBucket(score: number): 'critical' | 'sensitive' | 'informational' {
  if (score >= 70) return 'critical';
  if (score >= 40) return 'sensitive';
  return 'informational';
}

const CRIT_COLOR: Record<'critical' | 'sensitive' | 'informational', string> = {
  critical: '#a855f7', // purple-500
  sensitive: '#c084fc', // purple-400
  informational: '#475569', // slate-600
};

const KIND_COLOR: Record<IocKind, string> = {
  ip: '#c084fc',
  url: '#a855f7',
  domain: '#9333ea',
  hash: '#7e22ce',
};

const KIND_LABEL: Record<IocKind, string> = {
  ip: 'IP',
  url: 'URL',
  domain: 'Domain',
  hash: 'File hash',
};

const KIND_ORDER: IocKind[] = ['ip', 'url', 'domain', 'hash'];

export default function SocIocs(): JSX.Element {
  const [windowDays, setWindowDays] = useState<number>(7);
  const [data, setData] = useState<LiveIocsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [prevTotal, setPrevTotal] = useState<number | null>(null);
  /** Map kind -> active set (null = all). Empty = no filter. */
  const [kindFilter, setKindFilter] = useState<Set<IocKind>>(new Set());

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const r = (await fetchJson('/api/v1/live-iocs', { signal, cache: 'no-store' })) as LiveIocsResponse;
      setData((prev) => {
        if (prev) setPrevTotal(prev.total);
        return r;
      });
    } catch (e) {
      if ((e as { name?: string }).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : 'Failed to load.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const sources = useMemo(() => data?.sources ?? [], [data]);

  /* ─── Windowing + kind filter ─────────────────────────────────── */
  const inWindow = useMemo(() => {
    const cutoff = Date.now() - windowDays * 86400_000;
    return items.filter((i) => {
      if (kindFilter.size > 0 && !kindFilter.has(i.kind)) return false;
      if (!i.observed_at) return true; // bulk-snapshot sources have no per-entry time
      return Date.parse(i.observed_at) >= cutoff;
    });
  }, [items, windowDays, kindFilter]);

  const inWindowScoped = useMemo(() => {
    // For totals/KPIs, count uses the window filter but ignores kind filter
    // so a user can still see "X total / Y of those IPs".
    const cutoff = Date.now() - windowDays * 86400_000;
    return items.filter((i) => {
      if (!i.observed_at) return true;
      return Date.parse(i.observed_at) >= cutoff;
    });
  }, [items, windowDays]);

  /* ─── Criticality buckets ─────────────────────────────────────── */
  const buckets = useMemo(() => {
    const out = { critical: 0, sensitive: 0, informational: 0 };
    for (const i of inWindowScoped) {
      out[criticalityBucket(iocCriticality(i))] += 1;
    }
    return out;
  }, [inWindowScoped]);

  /* ─── Status: derived from critical count ─────────────────────── */
  const status = useMemo<{ label: string; tone: SocTone }>(() => {
    if (!data) return { label: 'LOADING', tone: 'amber' };
    const c = buckets.critical;
    if (c > 500) return { label: 'CRITICAL VOLUME — INVESTIGATE', tone: 'red' };
    if (c > 100) return { label: 'ELEVATED CRITICAL FLOW', tone: 'amber' };
    return { label: 'ACTIVE SENSORS', tone: 'purple' };
  }, [data, buckets.critical]);

  const totalInWindow = inWindowScoped.length;
  const kindFilteredTotal = inWindow.length;

  const totalDelta = useMemo(() => {
    if (prevTotal == null || !data) return null;
    const diff = data.total - prevTotal;
    if (diff === 0) return { text: 'stable', tone: 'slate' as const };
    return { text: `${diff > 0 ? '+' : ''}${diff.toLocaleString()} new`, tone: 'emerald' as const };
  }, [prevTotal, data]);

  /* ─── Type distribution (donut) ───────────────────────────────── */
  const typeSlices: DonutSlice[] = useMemo(() => {
    const counts = new Map<IocKind, number>();
    for (const i of inWindowScoped) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
    return KIND_ORDER.filter((k) => (counts.get(k) ?? 0) > 0).map((k) => ({
      label: KIND_LABEL[k],
      value: counts.get(k) ?? 0,
      color: KIND_COLOR[k],
    }));
  }, [inWindowScoped]);

  /* ─── Source distribution (horizontal bars) ──────────────────── */
  const sourceBars: BarItem[] = useMemo(() => {
    return sources
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
      .map((s, i) => ({
        label: s.id,
        value: s.count,
        hint: s.ok ? undefined : 'fetch failed',
        color: s.ok ? (i < 3 ? '#a855f7' : i < 6 ? '#c084fc' : '#9333ea') : '#475569',
      }));
  }, [sources]);

  /* ─── Criticality distribution (donut) ────────────────────────── */
  const critSlices: DonutSlice[] = useMemo(
    () =>
      [
        { label: 'CRITICAL', value: buckets.critical, color: CRIT_COLOR.critical },
        { label: 'SENSITIVE', value: buckets.sensitive, color: CRIT_COLOR.sensitive },
        { label: 'INFORMATIONAL', value: buckets.informational, color: CRIT_COLOR.informational },
      ].filter((s) => s.value > 0),
    [buckets]
  );

  /* ─── Daily observation timeline ──────────────────────────────── */
  const dailyCounts = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const i of inWindowScoped) {
      const k = dayKey(i.observed_at);
      if (!k) continue;
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label: label.slice(5), value }));
  }, [inWindowScoped]);

  const activeSources = sources.filter((s) => s.ok).length;

  /* ─── Top critical IOCs (sample) ──────────────────────────────── */
  const topCritical = useMemo(() => {
    return inWindowScoped
      .map((i) => ({ ioc: i, score: iocCriticality(i) }))
      .filter((x) => x.score >= 70)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [inWindowScoped]);

  /* ─── Export ──────────────────────────────────────────────────── */
  const onExport = useCallback(() => {
    if (!data) return;
    const rows: (string | number)[][] = [
      ['value', 'kind', 'source', 'reporter', 'context', 'observed_at', 'criticality'],
    ];
    for (const i of inWindowScoped) {
      rows.push([
        i.value,
        i.kind,
        i.source,
        i.reporter ?? '',
        (i.context ?? '').slice(0, 200),
        i.observed_at ?? '',
        criticalityBucket(iocCriticality(i)),
      ]);
    }
    downloadCsv(`soc-iocs-${windowDays}d-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }, [data, inWindowScoped, windowDays]);

  const toggleKind = (k: IocKind): void => {
    setKindFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <SocShell
      title="INDICATORS OF COMPROMISE (IOC)"
      tone="purple"
      icon={<Radar size={20} />}
      status={status}
      generatedAt={data?.generated_at ?? null}
      loading={loading}
      error={error}
      onRefresh={() => void load()}
      windowDays={windowDays}
      onWindowChange={setWindowDays}
      onExport={onExport}
      meta={
        <span>
          Live aggregation from <code className="text-slate-700 dark:text-slate-300">/api/v1/live-iocs</code> ·{' '}
          {activeSources}/{sources.length} sources healthy{data?.degraded ? ' · degraded' : ''}
        </span>
      }
    >
      {/* ─── KPI row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <SocKpi
          label="TOTAL CAPTURED IOCS"
          value={data ? data.total.toLocaleString() : '—'}
          tone="purple"
          sub={`${totalInWindow.toLocaleString()} observed in last ${windowDays}d`}
          icon={<Database size={16} />}
          delta={totalDelta?.text}
          deltaTone={totalDelta?.tone}
        />
        <SocKpi
          label="CRITICAL"
          value={
            <span className="inline-flex items-baseline gap-2">
              {buckets.critical}
              <span className="text-2xl text-slate-500 dark:text-slate-400">
                ({totalInWindow ? Math.round((buckets.critical / totalInWindow) * 1000) / 10 : 0}%)
              </span>
            </span>
          }
          tone="red"
          sub="score ≥ 70 · block & investigate"
          icon={<ShieldAlert size={16} />}
        />
        <SocKpi
          label="SENSITIVE"
          value={
            <span className="inline-flex items-baseline gap-2">
              {buckets.sensitive}
              <span className="text-2xl text-slate-500 dark:text-slate-400">
                ({totalInWindow ? Math.round((buckets.sensitive / totalInWindow) * 1000) / 10 : 0}%)
              </span>
            </span>
          }
          tone="purple"
          sub="score 40-69 · enrich & review"
          icon={<Zap size={16} />}
        />
        <SocKpi
          label="ACTIVE SOURCES"
          value={`${activeSources}/${sources.length}`}
          tone="cyan"
          sub="upstream feeds reporting"
          icon={<Activity size={16} />}
        />
      </div>

      {/* ─── Kind filter chips ────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-meta font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">
          kind
        </span>
        {KIND_ORDER.map((k) => {
          const on = kindFilter.has(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleKind(k)}
              className={`text-meta font-mono px-2.5 py-1 rounded border transition-colors ${
                on
                  ? 'border-purple-500 bg-purple-500/20 text-purple-700 dark:text-purple-200'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-purple-500/40'
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          );
        })}
        {kindFilter.size > 0 && (
          <button
            type="button"
            onClick={() => setKindFilter(new Set())}
            className="text-meta font-mono text-slate-500 hover:text-rose-500 ml-1"
          >
            clear
          </button>
        )}
        {kindFilter.size > 0 && (
          <span className="text-meta font-mono text-slate-500 ml-2">{kindFilteredTotal.toLocaleString()} matching</span>
        )}
      </div>

      {/* ─── Charts row 1 ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <SocPanel tone="purple">
          <SocSection title="DISTRIBUTION BY TYPE" tone="purple" />
          {typeSlices.length > 0 ? (
            <SocDonut
              slices={typeSlices}
              size={180}
              thickness={26}
              centerLabel={totalInWindow.toLocaleString()}
              centerSub="in window"
            />
          ) : (
            <p className="text-meta font-mono text-slate-500 italic">No IOCs in window.</p>
          )}
        </SocPanel>

        <SocPanel tone="purple">
          <SocSection
            title="THREAT FREQUENCY BY SOURCE"
            tone="purple"
            right={
              <Link
                to="/threatintel/feed-status"
                className="inline-flex items-center gap-1 text-meta font-mono text-slate-500 hover:text-brand-500"
              >
                feeds <ExternalLink size={10} />
              </Link>
            }
          />
          <SocBar items={sourceBars} tone="purple" />
        </SocPanel>

        <SocPanel tone="purple">
          <SocSection title="CRITICALITY DISTRIBUTION" tone="purple" />
          {critSlices.length > 0 ? (
            <SocDonut
              slices={critSlices}
              size={180}
              thickness={26}
              centerLabel={
                <span>
                  {buckets.critical}
                  <br />
                  <span className="text-meta font-mono text-slate-500">critical</span>
                </span>
              }
            />
          ) : (
            <p className="text-meta font-mono text-slate-500 italic">No IOCs in window.</p>
          )}
        </SocPanel>
      </div>

      {/* ─── Charts row 2: timeline + top critical ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <SocPanel tone="purple" className="lg:col-span-2">
          <SocSection
            title="OBSERVATION TIMELINE"
            tone="purple"
            right={
              <span className="text-meta font-mono text-slate-500">
                peak {Math.max(0, ...dailyCounts.map((d) => d.value))} / day
              </span>
            }
          />
          <SocBar
            items={dailyCounts.slice(-30)}
            tone="purple"
            vertical
            height={180}
            emptyText="No IOCs with per-entry timestamps in window."
          />
        </SocPanel>

        <SocPanel tone="red">
          <SocSection
            title="TOP CRITICAL"
            tone="red"
            right={
              <Link
                to="/threatintel/live-iocs"
                className="inline-flex items-center gap-1 text-meta font-mono text-slate-500 hover:text-brand-500"
              >
                all <ExternalLink size={10} />
              </Link>
            }
          />
          <TopCriticalList rows={topCritical} />
        </SocPanel>
      </div>
    </SocShell>
  );
}

function TopCriticalList({ rows }: { rows: { ioc: LiveIoc; score: number }[] }): JSX.Element {
  if (rows.length === 0) {
    return <p className="text-meta font-mono text-slate-500 italic">No critical IOCs in window.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={`${r.ioc.value}-${i}`} className="text-meta font-mono">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-purple-600 dark:text-purple-400 tabular-nums shrink-0">{r.score}</span>
            <span className="text-slate-700 dark:text-slate-300 truncate" title={r.ioc.value}>
              {r.ioc.value}
            </span>
            <span className="ml-auto text-slate-500 text-[10px] uppercase tracking-wider shrink-0">{r.ioc.kind}</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-500 truncate" title={r.ioc.context ?? ''}>
            {r.ioc.source}
            {r.ioc.context ? ` · ${r.ioc.context.slice(0, 60)}` : ''}
          </div>
        </li>
      ))}
    </ul>
  );
}
