import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bug, AlertTriangle, Flame, ShieldCheck, ExternalLink } from 'lucide-react';
import { fetchJson } from '../../lib/fetch-json';
import { SocShell, SocKpi, SocSection, SocPanel, type SocTone } from '../../components/threatintel/soc/SocShell';
import { SocBar, SocDonut, type BarItem, type DonutSlice } from '../../components/threatintel/soc/SocCharts';
import { downloadCsv, dayKey } from '../../components/threatintel/soc/utils';

/* ─── Data shape (matches /api/v1/cve-recent) ──────────────────────── */

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'UNKNOWN';

interface RecentCve {
  id: string;
  published: string;
  modified: string;
  description?: string;
  severity: Severity;
  score: number | null;
  kev: boolean;
  kev_added?: string;
  kev_ransomware?: boolean;
  actors?: Array<{ slug: string; mitre_id?: string; mitre_url?: string; mitre_name?: string }>;
  origin: 'nvd' | 'kev' | 'mti' | 'cvefeed';
}

interface CveRecentResponse {
  generated_at: string;
  sources: { id: string; ok: boolean; count: number; stale?: boolean }[];
  count: number;
  kev_count: number;
  cves: RecentCve[];
}

/* ─── Severity palette (canonical — mirrors src/components/Badge.tsx) ── */

const SEV_COLOR: Record<Severity, string> = {
  CRITICAL: '#e11d48', // rose-600
  HIGH: '#f97316', // orange-500
  MEDIUM: '#f59e0b', // amber-500
  LOW: '#06b6d4', // cyan-500
  NONE: '#64748b', // slate-500
  UNKNOWN: '#475569', // slate-600
};

const SEV_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NONE', 'UNKNOWN'];

/* ─── Vendor extraction (best-effort from CVE description) ─────────── */

// Common stopwords / generic terms in the description's "X in Y" prefix.
const VENDOR_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'in',
  'on',
  'of',
  'to',
  'for',
  'with',
  'and',
  'or',
  'multiple',
  'various',
  'allows',
  'enables',
  'causes',
  'could',
  'may',
  'might',
  'use',
  'via',
  'when',
  'unspecified',
  'remote',
  'attacker',
  'authenticated',
  'unauthenticated',
  'user',
  'users',
  'admin',
]);

/**
 * Heuristic vendor extraction from CVE description. Tries the first N words
 * of the description looking for a capitalized noun phrase before "in" /
 * "before" / "allows". Falls back to "Other" if nothing usable is found.
 * CISA publishes structured vendor data but it's not on the NVD payload,
 * so the description is the only signal we have at the API tier.
 */
function extractVendorFromDescription(desc: string | undefined): string {
  if (!desc) return 'Unknown';
  // Common NVD template: "<Vendor> <Product> in <...> contains/allows ..."
  // Capture the leading noun phrase (2-3 capitalized words).
  const m = desc.match(
    /^([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,2})(?:\s+(?:in|before|allows|contains|has|was|is|the|when|from))/
  );
  if (m) {
    const phrase = m[1].trim();
    if (phrase.length >= 3 && !VENDOR_STOPWORDS.has(phrase.toLowerCase())) return phrase;
  }
  // Fallback: take the first word if it looks like a vendor (starts with uppercase, >2 chars)
  const first = desc.split(/\s+/)[0];
  if (first && /^[A-Z][A-Za-z0-9]{2,}$/.test(first) && !VENDOR_STOPWORDS.has(first.toLowerCase())) {
    return first;
  }
  return 'Other';
}

export default function SocVulns(): JSX.Element {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [data, setData] = useState<CveRecentResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [prevKev, setPrevKev] = useState<number | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const r = (await fetchJson('/api/v1/cve-recent', { signal, cache: 'no-store' })) as CveRecentResponse;
      setData((prev) => {
        if (prev) setPrevKev(prev.kev_count);
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

  const cves = useMemo(() => data?.cves ?? [], [data]);

  /* ─── Windowing: filter CVEs to the last `windowDays` days ─────── */
  const inWindow = useMemo(() => {
    const cutoff = Date.now() - windowDays * 86400_000;
    return cves.filter((c) => Date.parse(c.published) >= cutoff);
  }, [cves, windowDays]);

  const counts = useMemo(() => {
    const out: Record<Severity, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      NONE: 0,
      UNKNOWN: 0,
    };
    for (const c of inWindow) out[c.severity] += 1;
    return out;
  }, [inWindow]);

  const total = inWindow.length;
  const criticalPct = total ? Math.round((counts.CRITICAL / total) * 1000) / 10 : 0;
  const highPct = total ? Math.round((counts.HIGH / total) * 1000) / 10 : 0;
  const kevInWindow = inWindow.filter((c) => c.kev).length;
  const kevTotal = data?.kev_count ?? 0;
  void kevInWindow;

  const kevDelta = useMemo(() => {
    if (prevKev == null) return null;
    const diff = kevTotal - prevKev;
    if (diff === 0) return { text: '0 new KEV', tone: 'slate' as const };
    return { text: `${diff > 0 ? '+' : ''}${diff} KEV`, tone: 'rose' as const };
  }, [prevKev, kevTotal]);

  /* ─── Status: derived from data, not hardcoded ────────────────── */
  const status = useMemo<{ label: string; tone: SocTone }>(() => {
    if (!data) return { label: 'LOADING', tone: 'amber' };
    if (counts.CRITICAL > 20) return { label: 'CRITICAL SURFACE — PATCH NOW', tone: 'red' };
    if (counts.CRITICAL > 5) return { label: 'ELEVATED CRITICAL EXPOSURE', tone: 'amber' };
    return { label: 'SYSTEM: NOMINAL / TRACKING EXPOSURES', tone: 'cyan' };
  }, [data, counts.CRITICAL]);

  /* ─── Daily detection frequency ───────────────────────────────── */
  const dailyCounts = useMemo(() => {
    if (inWindow.length === 0) return [];
    const buckets = new Map<string, number>();
    for (const c of inWindow) {
      const k = dayKey(c.published);
      if (!k) continue;
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label: label.slice(5), value }));
  }, [inWindow]);

  /* ─── Severity index (donut) ───────────────────────────────────── */
  const sevSlices: DonutSlice[] = useMemo(
    () => SEV_ORDER.filter((s) => counts[s] > 0).map((s) => ({ label: s, value: counts[s], color: SEV_COLOR[s] })),
    [counts]
  );

  /* ─── Top vendors ─────────────────────────────────────────────── */
  const topVendors: BarItem[] = useMemo(() => {
    if (inWindow.length === 0) return [];
    const counts = new Map<string, number>();
    for (const c of inWindow) {
      const v = extractVendorFromDescription(c.description);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const arr = Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    return arr.map((x, i) => ({
      label: x.label,
      value: x.value,
      hint: total ? `${Math.round((x.value / total) * 100)}%` : undefined,
      color: i < 3 ? '#06b6d4' : i < 6 ? '#0ea5e9' : '#64748b',
      href: `/threatintel/cve-list?vendor=${encodeURIComponent(x.label)}`,
    }));
  }, [inWindow, total]);

  /* ─── CVSS score distribution ─────────────────────────────────── */
  const cvssBins = useMemo(() => {
    if (inWindow.length === 0) return [];
    const bins = [
      { label: '0.1-3.9', min: 0.1, max: 3.99, n: 0 },
      { label: '4.0-6.9', min: 4.0, max: 6.99, n: 0 },
      { label: '7.0-8.9', min: 7.0, max: 8.99, n: 0 },
      { label: '9.0-10', min: 9.0, max: 10, n: 0 },
    ];
    for (const c of inWindow) {
      if (c.score == null) continue;
      const bin = bins.find((b) => c.score! >= b.min && c.score! <= b.max);
      if (bin) bin.n += 1;
    }
    return bins.map((b) => ({ label: b.label, value: b.n }));
  }, [inWindow]);

  /* ─── KEV-flagged CVEs (recent, high-value) ──────────────────── */
  const kevList = useMemo(() => inWindow.filter((c) => c.kev).slice(0, 10), [inWindow]);

  /* ─── Export ──────────────────────────────────────────────────── */
  const onExport = useCallback(() => {
    if (!data) return;
    const rows: (string | number)[][] = [['cve_id', 'published', 'severity', 'score', 'kev', 'vendor', 'description']];
    for (const c of inWindow) {
      rows.push([
        c.id,
        c.published,
        c.severity,
        c.score ?? '',
        c.kev ? 'yes' : 'no',
        extractVendorFromDescription(c.description),
        (c.description ?? '').replace(/\s+/g, ' ').slice(0, 240),
      ]);
    }
    downloadCsv(`soc-vulns-${windowDays}d-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }, [data, inWindow, windowDays]);

  const onItemClick = useCallback((it: BarItem) => {
    if (it.href) window.location.assign(it.href);
  }, []);

  return (
    <SocShell
      title="VULNERABILITY MONITORING"
      tone="cyan"
      icon={<Bug size={20} />}
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
          NVD + CISA KEV + MyThreatIntel ·{' '}
          <code className="text-slate-700 dark:text-slate-300">/api/v1/cve-recent</code>
          {data?.sources && (
            <>
              {' '}
              · sources ok: {data.sources.filter((s) => s.ok).length}/{data.sources.length}
            </>
          )}
        </span>
      }
    >
      {/* ─── KPI row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <SocKpi
          label="DISCOVERED CVES"
          value={total.toLocaleString()}
          tone="cyan"
          sub={`published in last ${windowDays} days`}
          icon={<Bug size={16} />}
        />
        <SocKpi
          label="CRITICAL VECTORS"
          value={
            <span className="inline-flex items-baseline gap-2">
              {counts.CRITICAL}
              <span className="text-2xl text-slate-500 dark:text-slate-400">({criticalPct}%)</span>
            </span>
          }
          tone="rose"
          sub="CVSS ≥ 9.0"
          icon={<Flame size={16} />}
        />
        <SocKpi
          label="HIGH SEVERITY"
          value={
            <span className="inline-flex items-baseline gap-2">
              {counts.HIGH}
              <span className="text-2xl text-slate-500 dark:text-slate-400">({highPct}%)</span>
            </span>
          }
          tone="amber"
          sub="CVSS 7.0 – 8.9"
          icon={<AlertTriangle size={16} />}
        />
        <SocKpi
          label="CISA KEV"
          value={kevTotal.toLocaleString()}
          tone="red"
          sub="known-exploited · all-time"
          icon={<ShieldCheck size={16} />}
          delta={kevDelta?.text}
          deltaTone={kevDelta?.tone}
        />
      </div>

      {/* ─── Charts row 1: line / donut / vendors ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <SocPanel tone="cyan">
          <SocSection
            title="DETECTION FREQUENCY"
            tone="cyan"
            right={
              <span className="text-meta font-mono text-slate-500">
                peak {Math.max(0, ...dailyCounts.map((d) => d.value))} / day
              </span>
            }
          />
          <SocBar items={dailyCounts.slice(-30)} tone="cyan" vertical height={180} emptyText="No CVEs in window." />
        </SocPanel>

        <SocPanel tone="rose">
          <SocSection title="SEVERITY INDEX" tone="rose" />
          {sevSlices.length > 0 ? (
            <SocDonut
              slices={sevSlices}
              size={180}
              thickness={26}
              centerLabel={`${total.toLocaleString()}`}
              centerSub="cves in window"
            />
          ) : (
            <p className="text-meta font-mono text-slate-500 italic">No CVEs in window.</p>
          )}
        </SocPanel>

        <SocPanel tone="cyan">
          <SocSection
            title="TOP VENDORS"
            tone="cyan"
            right={
              <Link
                to="/threatintel/cve-list"
                className="inline-flex items-center gap-1 text-meta font-mono text-slate-500 hover:text-brand-500"
              >
                all <ExternalLink size={10} />
              </Link>
            }
          />
          <SocBar items={topVendors} tone="cyan" onItemClick={onItemClick} />
        </SocPanel>
      </div>

      {/* ─── Charts row 2: CVSS dist + KEV list ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <SocPanel tone="cyan">
          <SocSection title="CVSS DISTRIBUTION" tone="cyan" />
          <SocBar items={cvssBins} tone="cyan" vertical height={160} />
        </SocPanel>

        <SocPanel tone="red" className="lg:col-span-2">
          <SocSection
            title="KEV-FLAGGED (RECENT)"
            tone="red"
            right={
              <Link
                to="/threatintel/cve-list?kev=1"
                className="inline-flex items-center gap-1 text-meta font-mono text-slate-500 hover:text-brand-500"
              >
                feed <ExternalLink size={10} />
              </Link>
            }
          />
          <KevTable rows={kevList} />
        </SocPanel>
      </div>
    </SocShell>
  );
}

function KevTable({ rows }: { rows: RecentCve[] }): JSX.Element {
  if (rows.length === 0) {
    return <p className="text-meta font-mono text-slate-500 italic">No CISA KEV entries in window.</p>;
  }
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-meta font-mono">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800">
            <th className="px-4 sm:px-2 py-2 font-medium">CVE</th>
            <th className="px-2 py-2 font-medium">CVSS</th>
            <th className="px-2 py-2 font-medium">Sev</th>
            <th className="px-2 py-2 py-2 font-medium">Vendor</th>
            <th className="px-2 py-2 font-medium text-right">Added to KEV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr
              key={c.id}
              className="border-b border-slate-100 dark:border-slate-800/60 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-900/40"
            >
              <td className="px-4 sm:px-2 py-1.5">
                <Link
                  to={`/dfir/cve?id=${encodeURIComponent(c.id)}`}
                  className="text-cyan-600 dark:text-cyan-400 hover:underline"
                >
                  {c.id}
                </Link>
              </td>
              <td className="px-2 py-1.5 tabular-nums text-slate-700 dark:text-slate-300">
                {c.score?.toFixed(1) ?? '—'}
              </td>
              <td className="px-2 py-1.5">
                <span
                  className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono"
                  style={{ backgroundColor: `${SEV_COLOR[c.severity]}22`, color: SEV_COLOR[c.severity] }}
                >
                  {c.severity}
                </span>
              </td>
              <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                {extractVendorFromDescription(c.description)}
              </td>
              <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400 text-right tabular-nums">
                {c.kev_added ? c.kev_added.slice(0, 10) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
