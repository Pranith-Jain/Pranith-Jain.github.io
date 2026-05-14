import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Briefcase,
  Bug,
  Flame,
  Globe2,
  Loader2,
  RefreshCw,
  Shield,
  Skull,
  TrendingUp,
  Users,
} from 'lucide-react';

/**
 * Threat Intel Metrics — quantitative read of what's flowing through the
 * platform RIGHT NOW. Everything is computed client-side from the same
 * four endpoints the other /threatintel pages use, so there's no new
 * worker code and no risk of stale aggregates: refresh → fresh chart.
 *
 * Ten panels answer the questions a CTI team actually asks:
 *   1. Who's most active in ransomware right now?              (HBar)
 *   2. What's the pace of ransomware claims this month?         (Area)
 *   3. How is CVE severity distributed in the current window?   (Stacked HBar)
 *   4. How often is CISA adding to KEV?                         (Sparkbars)
 *   5. Which brands are most-impersonated in active phishing?   (HBar)
 *   6. Which upstream feeds contribute the most IOCs right now? (HBar)
 *   7. Which sectors are ransomware groups targeting?           (HBar, heuristic)
 *   8. Which vendors are most-exploited on the KEV catalogue?   (HBar)
 *   9. Which malware families are spreading right now?          (HBar)
 *   10. Re-leak hotspots — groups doing the most cross-claims    (HBar)
 *
 * Charts are hand-rolled SVG — no Recharts/D3 dependency. Each is small,
 * presentational, and accessible (title/aria on rects + percentage labels).
 */

interface RansomwareVictim {
  victim: string;
  group: string;
  discovered: string;
  description?: string;
  source_url: string;
  /** Heuristic sector classification — see api/src/lib/sector-classifier.ts. */
  sector?: string;
}

interface RecentCve {
  id: string;
  published: string;
  modified: string;
  description?: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'UNKNOWN';
  score: number | null;
  kev: boolean;
  kev_added?: string;
}

interface PhishingUrl {
  url: string;
  source: 'openphish' | 'phishtank';
  target?: string;
  verified?: boolean;
}

interface ThreatMapResponse {
  generated_at: string;
  total_ips: number;
  countries: { country: string; countryCode: string; count: number }[];
  source_counts: Record<string, number>;
}

interface MalwareSample {
  sha256: string;
  signature?: string;
  tags?: string[];
  file_type?: string;
  first_seen?: string;
}

interface ReleakRow {
  key: string;
  group_count: number;
  raw_names: string[];
  claims: { group: string; raw_victim: string; discovered: string }[];
}

const SEVERITY_COLORS: Record<RecentCve['severity'], string> = {
  CRITICAL: '#e11d48', // rose-600
  HIGH: '#f59e0b', // amber-500
  MEDIUM: '#eab308', // yellow-500
  LOW: '#10b981', // emerald-500
  NONE: '#94a3b8', // slate-400
  UNKNOWN: '#64748b', // slate-500
};

function ago(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Date.now() - t;
}

function withinDays(iso: string, n: number): boolean {
  return ago(iso) <= n * 86400_000;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/* ─── SVG chart primitives ──────────────────────────────────────────── */

interface HBarItem {
  label: string;
  value: number;
  /** Optional secondary text shown after value (e.g. "(KEV)"). */
  hint?: string;
}

function HBar({
  items,
  max,
  color,
  formatValue,
}: {
  items: HBarItem[];
  max?: number;
  color: string;
  formatValue?: (n: number) => string;
}) {
  if (items.length === 0) {
    return <p className="text-xs font-mono text-slate-500 italic">No data in window.</p>;
  }
  const ceiling = max ?? Math.max(...items.map((i) => i.value), 1);
  const fmt = formatValue ?? ((n: number) => n.toLocaleString());
  return (
    <ul className="space-y-1.5">
      {items.map((it, idx) => {
        const pct = (it.value / ceiling) * 100;
        return (
          <li key={`${it.label}-${idx}`} className="text-[11px] font-mono">
            <div className="flex items-baseline justify-between mb-0.5">
              <span className="text-slate-700 dark:text-slate-300 truncate" title={it.label}>
                {it.label}
              </span>
              <span className="text-slate-500 tabular-nums shrink-0">
                {fmt(it.value)}
                {it.hint && <span className="text-slate-400 ml-1">{it.hint}</span>}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(2, pct)}%`, backgroundColor: color }}
                aria-label={`${it.label}: ${fmt(it.value)}`}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StackedSeverityBar({ counts, total }: { counts: Record<RecentCve['severity'], number>; total: number }) {
  const order: RecentCve['severity'][] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE', 'UNKNOWN'];
  const segments = order.map((sev) => ({ sev, n: counts[sev] ?? 0 })).filter((s) => s.n > 0);
  if (total === 0) {
    return <p className="text-xs font-mono text-slate-500 italic">No CVEs in window.</p>;
  }
  return (
    <div>
      <div className="h-3 rounded overflow-hidden flex">
        {segments.map(({ sev, n }) => {
          const pct = (n / total) * 100;
          return (
            <div
              key={sev}
              style={{ width: `${pct}%`, backgroundColor: SEVERITY_COLORS[sev] }}
              title={`${sev}: ${n} (${pct.toFixed(0)}%)`}
            />
          );
        })}
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 mt-3 text-[11px] font-mono">
        {order.map((sev) => {
          const n = counts[sev] ?? 0;
          if (n === 0) return null;
          const pct = (n / total) * 100;
          return (
            <li key={sev} className="flex items-baseline gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-sm shrink-0"
                style={{ backgroundColor: SEVERITY_COLORS[sev] }}
              />
              <span className="text-slate-700 dark:text-slate-300">{sev}</span>
              <span className="ml-auto text-slate-500 tabular-nums">
                {n} <span className="text-slate-400">({pct.toFixed(0)}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Sparkbars({ buckets, color }: { buckets: { label: string; value: number }[]; color: string }) {
  if (buckets.length === 0) {
    return <p className="text-xs font-mono text-slate-500 italic">No data.</p>;
  }
  const ceiling = Math.max(...buckets.map((b) => b.value), 1);
  const w = 360;
  const h = 80;
  const barW = w / buckets.length - 2;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h + 24}`} className="w-full">
        {buckets.map((b, i) => {
          const x = (i * w) / buckets.length;
          const barH = (b.value / ceiling) * h;
          return (
            <g key={`${b.label}-${i}`}>
              <rect
                x={x + 1}
                y={h - barH}
                width={barW}
                height={Math.max(1, barH)}
                fill={color}
                rx={1}
                aria-label={`${b.label}: ${b.value}`}
              >
                <title>
                  {b.label}: {b.value}
                </title>
              </rect>
              {b.value > 0 && barH > 12 && (
                <text
                  x={x + 1 + barW / 2}
                  y={h - barH + 10}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#fff"
                  fontFamily="ui-monospace,monospace"
                >
                  {b.value}
                </text>
              )}
              <text
                x={x + 1 + barW / 2}
                y={h + 14}
                textAnchor="middle"
                fontSize="9"
                fontFamily="ui-monospace,monospace"
                fill="currentColor"
                className="text-slate-500"
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────── */

interface State {
  ransomware: RansomwareVictim[] | null;
  cves: RecentCve[] | null;
  phishing: PhishingUrl[] | null;
  threatMap: ThreatMapResponse | null;
  malware: MalwareSample[] | null;
  releaks: ReleakRow[] | null;
  refreshedAt: string | null;
  loading: boolean;
  error: string | null;
}

const INITIAL: State = {
  ransomware: null,
  cves: null,
  phishing: null,
  threatMap: null,
  malware: null,
  releaks: null,
  refreshedAt: null,
  loading: true,
  error: null,
};

export default function Metrics(): JSX.Element {
  const [state, setState] = useState<State>(INITIAL);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const [rRes, cRes, pRes, tmRes, mRes, rlRes] = await Promise.allSettled([
          fetch('/api/v1/ransomware-recent').then((r) => (r.ok ? r.json() : Promise.reject(`ransomware ${r.status}`))),
          fetch('/api/v1/cve-recent').then((r) => (r.ok ? r.json() : Promise.reject(`cve ${r.status}`))),
          fetch('/api/v1/phishing-urls').then((r) => (r.ok ? r.json() : Promise.reject(`phishing ${r.status}`))),
          fetch('/api/v1/threat-map').then((r) => (r.ok ? r.json() : Promise.reject(`threat-map ${r.status}`))),
          fetch('/api/v1/malware-samples').then((r) => (r.ok ? r.json() : Promise.reject(`malware ${r.status}`))),
          fetch('/api/v1/victim-releaks').then((r) => (r.ok ? r.json() : Promise.reject(`releaks ${r.status}`))),
        ]);
        if (cancelled) return;
        setState({
          ransomware:
            rRes.status === 'fulfilled' ? ((rRes.value as { victims: RansomwareVictim[] }).victims ?? []) : null,
          cves: cRes.status === 'fulfilled' ? ((cRes.value as { cves: RecentCve[] }).cves ?? []) : null,
          phishing: pRes.status === 'fulfilled' ? ((pRes.value as { urls: PhishingUrl[] }).urls ?? []) : null,
          threatMap: tmRes.status === 'fulfilled' ? (tmRes.value as ThreatMapResponse) : null,
          malware: mRes.status === 'fulfilled' ? ((mRes.value as { samples: MalwareSample[] }).samples ?? []) : null,
          releaks: rlRes.status === 'fulfilled' ? ((rlRes.value as { releaks: ReleakRow[] }).releaks ?? []) : null,
          refreshedAt: new Date().toISOString(),
          loading: false,
          error: null,
        });
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  /* ─── Derived metrics ─── */

  const topRansomwareGroups = useMemo<HBarItem[]>(() => {
    if (!state.ransomware) return [];
    const map = new Map<string, number>();
    for (const v of state.ransomware) {
      if (!withinDays(v.discovered, 30)) continue;
      map.set(v.group, (map.get(v.group) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [state.ransomware]);

  const ransomwareCadence = useMemo(() => {
    if (!state.ransomware) return [] as { label: string; value: number }[];
    const map = new Map<string, number>();
    const now = new Date();
    // Build 30 day buckets so empty days show as 0.
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400_000);
      const key = d.toISOString().slice(0, 10);
      map.set(key, 0);
    }
    for (const v of state.ransomware) {
      const key = dayKey(v.discovered);
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].map(([k, v], i) => ({
      label: i % 5 === 0 ? k.slice(5) : '', // sparse axis labels (every 5 days)
      value: v,
    }));
  }, [state.ransomware]);

  const cveSeverityCounts = useMemo(() => {
    const counts: Record<RecentCve['severity'], number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      NONE: 0,
      UNKNOWN: 0,
    };
    if (!state.cves) return { counts, total: 0 };
    for (const c of state.cves) counts[c.severity] = (counts[c.severity] ?? 0) + 1;
    return { counts, total: state.cves.length };
  }, [state.cves]);

  const kevCadence = useMemo(() => {
    if (!state.cves) return [] as { label: string; value: number }[];
    // Last 12 weeks of KEV adds, by ISO week.
    const map = new Map<string, number>();
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getTime() - i * 7 * 86400_000);
      const key = `W${weekOfYear(start)}`;
      map.set(key, 0);
    }
    for (const c of state.cves) {
      if (!c.kev || !c.kev_added) continue;
      if (!withinDays(c.kev_added, 12 * 7)) continue;
      const wk = `W${weekOfYear(new Date(c.kev_added))}`;
      if (map.has(wk)) map.set(wk, (map.get(wk) ?? 0) + 1);
    }
    return [...map.entries()].map(([label, value]) => ({ label, value }));
  }, [state.cves]);

  const topPhishingBrands = useMemo<HBarItem[]>(() => {
    if (!state.phishing) return [];
    const map = new Map<string, number>();
    for (const u of state.phishing) {
      const t = u.target?.trim();
      if (!t || t === 'Other' || t.toLowerCase() === 'unknown') continue;
      map.set(t, (map.get(t) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [state.phishing]);

  const iocSourceVolume = useMemo<HBarItem[]>(() => {
    if (!state.threatMap) return [];
    return Object.entries(state.threatMap.source_counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [state.threatMap]);

  const targetedSectors = useMemo<HBarItem[]>(() => {
    if (!state.ransomware) return [];
    const map = new Map<string, number>();
    for (const v of state.ransomware) {
      if (!withinDays(v.discovered, 30)) continue;
      const s = v.sector || 'Unknown';
      if (s === 'Unknown') continue;
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [state.ransomware]);

  const sectorClassifiedPct = useMemo(() => {
    if (!state.ransomware?.length) return 0;
    const within = state.ransomware.filter((v) => withinDays(v.discovered, 30));
    if (!within.length) return 0;
    const known = within.filter((v) => v.sector && v.sector !== 'Unknown').length;
    return Math.round((known / within.length) * 100);
  }, [state.ransomware]);

  /** Top vendors on the KEV catalogue. Parsed from "[KEV] Vendor Product:" prefix in description. */
  const topKevVendors = useMemo<HBarItem[]>(() => {
    if (!state.cves) return [];
    const map = new Map<string, number>();
    for (const c of state.cves) {
      if (!c.kev) continue;
      const m = /^\[KEV\]\s+([^:]+):/.exec(c.description ?? '');
      if (!m) continue;
      // First token of "Vendor Product Subproduct" is usually the vendor.
      const vendor = m[1]!.split(/[\s/]+/)[0]!.trim();
      if (!vendor) continue;
      map.set(vendor, (map.get(vendor) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [state.cves]);

  /** Top malware families seen in the last 24h (MalwareBazaar signature field). */
  const topMalwareFamilies = useMemo<HBarItem[]>(() => {
    if (!state.malware) return [];
    const map = new Map<string, number>();
    for (const s of state.malware) {
      const family = (s.signature ?? '').trim();
      if (!family || family.toLowerCase() === 'n/a' || family.toLowerCase() === 'unknown') continue;
      map.set(family, (map.get(family) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [state.malware]);

  /** Groups making the most cross-claims (re-leak hotspots). */
  const releakGroups = useMemo<HBarItem[]>(() => {
    if (!state.releaks) return [];
    const map = new Map<string, number>();
    for (const r of state.releaks) {
      for (const c of r.claims) map.set(c.group, (map.get(c.group) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [state.releaks]);

  /* ─── Summary header counts ─── */
  const summary = useMemo(() => {
    const r = state.ransomware?.filter((v) => withinDays(v.discovered, 30)).length ?? 0;
    const c = state.cves?.length ?? 0;
    const kevCount = state.cves?.filter((x) => x.kev).length ?? 0;
    const p = state.phishing?.length ?? 0;
    const ips = state.threatMap?.total_ips ?? 0;
    return { r, c, kevCount, p, ips };
  }, [state]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <BarChart3 size={28} className="text-brand-600 dark:text-brand-400" /> Threat Intel Metrics
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-6 max-w-3xl">
          Ten panels answering the questions a CTI team actually asks. Everything is computed live in the browser from
          the same upstream feeds the rest of the platform reads. Refresh to recompute.
        </p>
      </div>

      {/* Headline totals + refresh */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 text-[13px] sm:text-[12px] font-mono w-full sm:w-auto">
          <Stat label="ransomware claims · 30d" value={summary.r} loading={state.loading} />
          <Stat label="CVEs in window" value={summary.c} loading={state.loading} />
          <Stat label="on CISA KEV" value={summary.kevCount} loading={state.loading} accent="rose" />
          <Stat label="active phishing URLs" value={summary.p} loading={state.loading} />
          <Stat label="malicious IPs · live" value={summary.ips} loading={state.loading} />
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </section>

      {state.loading && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 inline-flex items-center gap-2 font-mono text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> computing aggregates from upstream feeds…
        </div>
      )}

      {state.error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 font-mono text-sm text-rose-600 dark:text-rose-300">
          Failed to load: {state.error}
        </div>
      )}

      {!state.loading && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* 1. Top ransomware groups */}
          <ChartCard
            icon={Skull}
            title="Most active ransomware groups"
            question="Who's claiming the most victims in the last 30 days?"
            footer={`From Ransomlook · ${state.ransomware?.length ?? 0} total claims indexed`}
            href="/threatintel/ransomware-activity"
          >
            <HBar items={topRansomwareGroups} color="#e11d48" />
          </ChartCard>

          {/* 2. Ransomware cadence */}
          <ChartCard
            icon={TrendingUp}
            title="Ransomware cadence · last 30 days"
            question="Is leak-site posting accelerating or cooling?"
            footer="Daily claim count; sparse x-axis labels every 5 days"
            href="/threatintel/ransomware-activity"
          >
            <Sparkbars buckets={ransomwareCadence} color="#e11d48" />
          </ChartCard>

          {/* 3. CVE severity distribution */}
          <ChartCard
            icon={BarChart3}
            title="CVE severity distribution"
            question="How serious are this window's CVEs?"
            footer={`${cveSeverityCounts.total} CVEs (NVD pubStartDate last 30d + CISA KEV last 30d merge)`}
            href="/threatintel/cve-list"
          >
            <StackedSeverityBar counts={cveSeverityCounts.counts} total={cveSeverityCounts.total} />
          </ChartCard>

          {/* 4. KEV cadence */}
          <ChartCard
            icon={Flame}
            title="CISA KEV cadence · last 12 weeks"
            question="How quickly is CISA flagging actively-exploited CVEs?"
            footer={`${summary.kevCount} entries on KEV in this window`}
            href="/threatintel/cve-list"
          >
            <Sparkbars buckets={kevCadence} color="#f59e0b" />
          </ChartCard>

          {/* 5. Top phishing brands */}
          <ChartCard
            icon={Activity}
            title="Most-impersonated brands"
            question="Whose customers are getting phished right now?"
            footer={`From PhishTank. ${state.phishing?.filter((u) => u.target).length ?? 0} URLs have brand attribution.`}
            href="/threatintel/live-iocs"
          >
            <HBar items={topPhishingBrands} color="#0ea5e9" />
          </ChartCard>

          {/* 6. IOC source volume */}
          <ChartCard
            icon={Globe2}
            title="IOC volume by upstream feed"
            question="Which feed is publishing the most malicious IPs right now?"
            footer={`Cross-feed view · ${summary.ips} total IPs across upstream sources`}
            href="/threatintel/threat-map"
          >
            <HBar items={iocSourceVolume} color="#8b5cf6" />
          </ChartCard>

          {/* 7. Targeted sectors (heuristic) */}
          <ChartCard
            icon={Briefcase}
            title="Targeted sectors · 30d (heuristic)"
            question="Which industries are ransomware groups hitting right now?"
            footer={`Classified ${sectorClassifiedPct}% of recent victims by keyword match on victim name + description. Best-effort; verify before action.`}
            href="/threatintel/ransomware-activity"
          >
            <HBar items={targetedSectors} color="#0891b2" />
          </ChartCard>

          {/* 8. Top KEV vendors */}
          <ChartCard
            icon={Shield}
            title="Most-exploited vendors on CISA KEV"
            question="Whose products are taking the most active-exploitation hits?"
            footer={`Parsed from KEV vulnerability descriptions in the current CVE window`}
            href="/threatintel/cve-list"
          >
            <HBar items={topKevVendors} color="#dc2626" />
          </ChartCard>

          {/* 9. Top malware families */}
          <ChartCard
            icon={Bug}
            title="Most-active malware families · 24h"
            question="Which malware families are dropping on MalwareBazaar right now?"
            footer={`From MalwareBazaar recent samples · ${state.malware?.length ?? 0} samples in window`}
            href="/threatintel/live-iocs"
          >
            <HBar items={topMalwareFamilies} color="#a855f7" />
          </ChartCard>

          {/* 10. Re-leak hotspot groups */}
          <ChartCard
            icon={Users}
            title="Re-leak hotspots: groups doing the most cross-claims"
            question="Which groups appear in cross-actor re-leaks the most? (affiliate-movement signal)"
            footer={`${state.releaks?.length ?? 0} re-leaks across top-8 active groups`}
            href="/threatintel/re-leaks"
          >
            <HBar items={releakGroups} color="#f43f5e" />
          </ChartCard>
        </div>
      )}

      {/* Related-surfaces footer (replaces the old "what's missing / shipped" changelog) */}
      <section className="mt-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h3 className="font-display font-semibold text-sm mb-3">Related surfaces</h3>
        <div className="grid sm:grid-cols-2 gap-2 text-[12px] font-mono">
          <a
            href="/threatintel/correlation"
            className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 text-slate-700 dark:text-slate-300"
          >
            Cross-source IOC correlation →
          </a>
          <a
            href="/threatintel/actor-timeline"
            className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 text-slate-700 dark:text-slate-300"
          >
            Actor activity timeline + MITRE TTPs →
          </a>
          <a
            href="/threatintel/re-leaks"
            className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 text-slate-700 dark:text-slate-300"
          >
            Victim re-leak detection →
          </a>
          <a
            href="/threatintel/live-iocs"
            className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 text-slate-700 dark:text-slate-300"
          >
            Live IOC stream →
          </a>
        </div>
      </section>

      {state.refreshedAt && (
        <p className="text-[10px] font-mono text-slate-500 mt-6 text-right">
          recomputed {new Date(state.refreshedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

/* ─── ISO week-of-year for KEV cadence x-axis ─── */
function weekOfYear(d: Date): number {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
}

/* ─── Small helpers ─── */

function Stat({
  label,
  value,
  loading,
  accent,
}: {
  label: string;
  value: number | string;
  loading?: boolean;
  accent?: 'rose';
}) {
  return (
    <div className="flex flex-col">
      <span
        className={`tabular-nums text-base font-display font-semibold ${
          accent === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'
        }`}
      >
        {loading ? '—' : typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
    </div>
  );
}

function ChartCard({
  icon: Icon,
  title,
  question,
  footer,
  href,
  children,
}: {
  icon: typeof BarChart3;
  title: string;
  question: string;
  footer: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="font-display font-semibold text-sm inline-flex items-center gap-2">
          <Icon size={14} className="text-brand-600 dark:text-brand-400" /> {title}
        </h3>
        {href && (
          <Link to={href} className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline">
            details →
          </Link>
        )}
      </div>
      <p className="text-[11px] font-mono italic text-slate-500 mb-3">{question}</p>
      <div className="mb-3">{children}</div>
      <p className="text-[10px] font-mono text-slate-400">{footer}</p>
    </div>
  );
}
