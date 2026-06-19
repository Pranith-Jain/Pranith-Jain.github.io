import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldAlert, Skull, Users, Crosshair, Building2, ExternalLink } from 'lucide-react';
import { fetchJson } from '../../lib/fetch-json';
import { SocShell, SocKpi, SocSection, SocPanel, type SocStatus } from '../../components/threatintel/soc/SocShell';
import { SocBar, SocDonut, type BarItem, type DonutSlice } from '../../components/threatintel/soc/SocCharts';
import { downloadCsv, dayKey, formatNumber } from '../../components/threatintel/soc/utils';
import { CHART_RANK, CHART_DAILY, CHART_SECTOR } from '../../components/threatintel/soc/tone';

/* ─── Data shape (matches /api/v1/ransomware-recent) ────────────────── */

interface RansomwareVictim {
  victim: string;
  group: string;
  discovered: string;
  description?: string;
  source_url: string;
  sector?: string;
  country?: string;
}

interface GroupCount {
  group: string;
  count: number;
}
interface SectorCount {
  sector: string;
  count: number;
  pct: number;
}

interface RansomwareResponse {
  generated_at: string;
  source: string;
  count: number;
  groups: GroupCount[];
  sectors: SectorCount[];
  victims: RansomwareVictim[];
}

function colorForSector(s: string): string {
  return CHART_SECTOR[s] ?? '#94a3b8';
}

export default function SocRansomware(): JSX.Element {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [data, setData] = useState<RansomwareResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  /** Previous count of victims (for delta chip). Captured on the prior successful load. */
  const [prevCount, setPrevCount] = useState<number | null>(null);
  const dataRef = useRef<RansomwareResponse | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const r = (await fetchJson(`/api/v1/ransomware-recent?days=${windowDays}`, {
          signal,
          cache: 'no-store',
        })) as RansomwareResponse;
        setData(r);
      } catch (e) {
        if ((e as { name?: string }).name !== 'AbortError') {
          setError(e instanceof Error ? e.message : 'Failed to load.');
        }
      } finally {
        setLoading(false);
      }
    },
    [windowDays]
  );

  // Capture the previous data on each successful load so the delta chip
  // compares "now" vs "last refresh" rather than always reading 0. The ref
  // is updated *after* reading so we always see the prior value.
  useEffect(() => {
    if (data && dataRef.current && dataRef.current !== data) {
      setPrevCount(dataRef.current.count);
    }
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const victims = useMemo(() => data?.victims ?? [], [data]);

  /* ─── KPIs ─────────────────────────────────────────────────────── */
  const kpis = useMemo(() => {
    const groups = data?.groups ?? [];
    const top = groups[0];
    const topShare = data?.count && top ? Math.round((top.count / data.count) * 100) : 0;
    // Top *named* sector — skip the "Unknown"/"Other" buckets so the headline
    // reflects an actual targeted industry rather than the unclassified pile.
    const topSec = (data?.sectors ?? [])
      .filter((s) => s.count > 0 && s.sector && s.sector !== 'Unknown' && s.sector !== 'Other')
      .sort((a, b) => b.count - a.count)[0];
    return {
      total: data?.count ?? 0,
      groups: groups.length,
      topName: top?.group ?? '—',
      topPct: top ? `${topShare}%` : '—',
      topSector: topSec?.sector ?? '—',
      topSectorPct: topSec ? `${topSec.pct}%` : null,
    };
  }, [data]);

  const delta = useMemo(() => {
    if (prevCount == null || !data) return null;
    const diff = data.count - prevCount;
    if (diff === 0) return { text: '· stable', direction: 'flat' as const };
    return {
      text: `${diff > 0 ? '+' : ''}${diff} since last refresh`,
      direction: diff > 0 ? ('up' as const) : ('down' as const),
    };
  }, [prevCount, data]);

  /* ─── Status logic (severity-driven) ───────────────────────────── */
  const status = useMemo<SocStatus>(() => {
    if (!data) return { label: 'Loading', severity: 'medium' };
    if (data.count === 0) return { label: 'Nominal', severity: 'ok' };
    if (kpis.topPct !== '—' && parseInt(kpis.topPct, 10) >= 20)
      return { label: 'Critical · active intrusions', severity: 'critical' };
    if (data.count > 50) return { label: 'High · active intrusions detected', severity: 'high' };
    if (data.count > 10) return { label: 'Elevated activity', severity: 'medium' };
    return { label: 'Low activity', severity: 'low' };
  }, [data, kpis.topPct]);

  /* ─── Charts data ──────────────────────────────────────────────── */
  const groupBars: BarItem[] = useMemo(() => {
    const groups = data?.groups ?? [];
    return groups.slice(0, 12).map((g, i) => ({
      label: g.group,
      value: g.count,
      color: CHART_RANK[Math.min(i, CHART_RANK.length - 1)],
      href: `/threatintel/actors/${encodeURIComponent(slugifyGroup(g.group))}`,
    }));
  }, [data]);

  const sectorSlices: DonutSlice[] = useMemo(() => {
    const sectors = data?.sectors ?? [];
    return sectors
      .filter((s) => s.count > 0)
      .map((s) => ({ label: s.sector, value: s.count, color: colorForSector(s.sector) }));
  }, [data]);

  const countrySlices: DonutSlice[] = useMemo(() => {
    if (victims.length === 0) return [];
    const counts = new Map<string, number>();
    for (const v of victims) {
      const c = v.country?.trim();
      if (!c) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const arr = Array.from(counts.entries())
      .map(([country, value]) => ({ country, value }))
      .sort((a, b) => b.value - a.value);
    const top = arr.slice(0, 8);
    const rest = arr.slice(8).reduce((s, x) => s + x.value, 0);
    const slices: DonutSlice[] = top.map((x, i) => ({
      label: x.country,
      value: x.value,
      color: CHART_RANK[Math.min(i, CHART_RANK.length - 1)],
    }));
    if (rest > 0) slices.push({ label: 'Other', value: rest, color: 'rgb(var(--muted, #94a3b8))' });
    const unknown = victims.length - arr.reduce((s, x) => s + x.value, 0);
    if (unknown > 0) slices.push({ label: 'Unknown', value: unknown, color: 'rgb(var(--text-secondary, #64748b))' });
    return slices;
  }, [victims]);

  /* ─── Daily timeline ───────────────────────────────────────────── */
  const timeline = useMemo(() => {
    if (victims.length === 0) return [];
    const buckets = new Map<string, number>();
    for (const v of victims) {
      const k = dayKey(v.discovered);
      if (!k) continue;
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label: label.slice(5), value }));
  }, [victims]);

  /* ─── Export ───────────────────────────────────────────────────── */
  const onExport = useCallback(() => {
    if (!data) return;
    const rows: (string | number)[][] = [['victim', 'group', 'discovered', 'sector', 'country', 'source_url']];
    for (const v of victims) {
      rows.push([v.victim, v.group, v.discovered, v.sector ?? '', v.country ?? '', v.source_url]);
    }
    downloadCsv(`soc-ransomware-${windowDays}d-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }, [data, victims, windowDays]);

  /* ─── Handlers ─────────────────────────────────────────────────── */
  const navigate = useNavigate();
  const onItemClick = useCallback(
    (it: BarItem) => {
      if (it.href) navigate(it.href);
    },
    [navigate]
  );

  const totalClaims = data?.count ?? 0;
  const totalGroups = data?.groups.length ?? 0;

  return (
    <SocShell
      title="Ransomware intelligence"
      icon={<ShieldAlert size={28} />}
      status={status}
      generatedAt={data?.generated_at ?? null}
      loading={loading}
      error={error}
      onRefresh={() => void load()}
      windowDays={windowDays}
      onWindowChange={setWindowDays}
      onExport={onExport}
      description={
        <span>
          Recent ransomware leak-site claims merged across{' '}
          <Link
            to="/threatintel/darkweb/ransom-activity"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            live trackers
          </Link>
          , deduped by (group + victim + day). Volume, top actors, country and sector attribution with auto-refresh and
          CSV export.
        </span>
      }
      meta={
        <span>
          source: <span className="uppercase">{data?.source ?? '—'}</span>
          {data && data.victims.length > 0
            ? ` · ${data.victims.length} cross-claim record${data.victims.length === 1 ? '' : 's'}`
            : data
              ? ' · no claims in window'
              : ''}
        </span>
      }
    >
      {/* ─── KPI row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <SocKpi
          label="Registered victims"
          value={formatNumber(totalClaims)}
          severity={totalClaims > 0 ? 'critical' : 'ok'}
          sub={`in last ${windowDays} days`}
          icon={<Skull size={16} />}
          delta={delta?.text}
          deltaDirection={delta?.direction}
        />
        <SocKpi
          label="Threat groups"
          value={totalGroups}
          severity="medium"
          sub="distinct actors in window"
          icon={<Users size={16} />}
        />
        <SocKpi
          label="Main actor"
          value={
            <span className="inline-flex items-baseline gap-2">
              <span className="truncate">{kpis.topName}</span>
              <span className="text-2xl text-slate-500 dark:text-slate-400">({kpis.topPct})</span>
            </span>
          }
          severity="high"
          sub="share of total claims"
          icon={<Crosshair size={16} />}
        />
        <SocKpi
          label="Top sector"
          value={
            <span className="inline-flex items-baseline gap-2">
              <span className="truncate">{kpis.topSector}</span>
              {kpis.topSectorPct && (
                <span className="text-2xl text-slate-500 dark:text-slate-400">({kpis.topSectorPct})</span>
              )}
            </span>
          }
          severity="medium"
          sub="most-targeted industry"
          icon={<Building2 size={16} />}
        />
      </div>

      {/* ─── Charts row 1: actor bar + country donut + sector donut ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <SocPanel>
          <SocSection
            title="Volume by actor"
            right={
              <Link
                to="/threatintel/catalog?cat=actors"
                className="inline-flex items-center gap-1 text-meta font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
              >
                all <ExternalLink size={10} />
              </Link>
            }
          />
          <SocBar items={groupBars} axis onItemClick={onItemClick} />
        </SocPanel>

        <SocPanel>
          <SocSection title="Distribution by country" />
          {countrySlices.length > 0 ? (
            <SocDonut
              slices={countrySlices}
              size={180}
              centerLabel={formatNumber(countrySlices.reduce((s, x) => s + x.value, 0))}
              centerSub="by country"
            />
          ) : (
            <p className="text-meta font-mono text-slate-500 italic">No country attribution in this window.</p>
          )}
        </SocPanel>

        <SocPanel>
          <SocSection title="Distribution by sector" />
          {sectorSlices.length > 0 ? (
            <SocDonut
              slices={sectorSlices}
              size={180}
              centerLabel={formatNumber(sectorSlices.reduce((s, x) => s + x.value, 0))}
              centerSub="by sector"
            />
          ) : (
            <p className="text-meta font-mono text-slate-500 italic">No sector attribution in this window.</p>
          )}
        </SocPanel>
      </div>

      {/* ─── Charts row 2: timeline + sector bars + actor donut ────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <SocPanel className="lg:col-span-2">
          <SocSection
            title="Claim frequency (daily)"
            right={
              timeline.length > 0 ? (
                <span className="text-meta font-mono text-slate-500 dark:text-slate-400">
                  peak {Math.max(...timeline.map((t) => t.value))} / day
                </span>
              ) : null
            }
          />
          <SocBar
            items={timeline.slice(-30).map((t) => ({ label: t.label, value: t.value }))}
            vertical
            height={180}
            defaultColor={CHART_DAILY}
            emptyText="No claims in this window."
          />
        </SocPanel>

        <div className="space-y-3 sm:space-y-4">
          <SocPanel>
            <SocSection
              title="Sector breakdown"
              right={<span className="text-meta font-mono text-slate-500 dark:text-slate-400">by share %</span>}
            />
            <SocBar
              items={(data?.sectors ?? []).slice(0, 8).map((s) => ({
                label: s.sector,
                value: s.count,
                hint: `${s.pct}%`,
                color: colorForSector(s.sector),
              }))}
            />
          </SocPanel>

          <SocPanel>
            <SocSection title="Quick stats" />
            <dl className="space-y-2 text-meta font-mono">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">top country</dt>
                <dd className="text-slate-700 dark:text-slate-300">{countrySlices[0]?.label ?? '—'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">top group</dt>
                <dd className="text-slate-700 dark:text-slate-300">{kpis.topName}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-slate-500 dark:text-slate-400">sectors hit</dt>
                <dd className="text-slate-700 dark:text-slate-300">{sectorSlices.length}</dd>
              </div>
            </dl>
          </SocPanel>
        </div>
      </div>

      {/* ─── Recent claims table ──────────────────────────────────── */}
      <div className="mt-6">
        <SocPanel>
          <SocSection
            title="Recent claims"
            right={
              <Link
                to="/threatintel/darkweb/ransom-activity"
                className="inline-flex items-center gap-1 text-meta font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
              >
                feed <ExternalLink size={10} />
              </Link>
            }
          />
          <RecentClaims rows={victims.slice(0, 10)} />
        </SocPanel>
      </div>
    </SocShell>
  );
}

/* ─── Helper: tiny recent claims table ─────────────────────────────── */

function RecentClaims({ rows }: { rows: RansomwareVictim[] }): JSX.Element {
  if (rows.length === 0) {
    return <p className="text-meta font-mono text-slate-500 italic">No claims in window.</p>;
  }
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-meta font-mono">
        <thead>
          <tr className="text-left text-mini uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
            <th className="px-4 sm:px-2 py-2 font-mono font-medium">Victim</th>
            <th className="px-2 py-2 font-mono font-medium">Group</th>
            <th className="px-2 py-2 font-mono font-medium">Sector</th>
            <th className="px-2 py-2 font-mono font-medium">Country</th>
            <th className="px-2 py-2 font-mono font-medium text-right">Discovered</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v, i) => (
            <tr
              key={`${v.victim}-${i}`}
              className="border-b border-slate-100 dark:border-[rgb(var(--border-400))]/60 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-900/40"
            >
              <td
                className="px-4 sm:px-2 py-1.5 text-slate-900 dark:text-slate-100 truncate max-w-[200px]"
                title={v.victim}
              >
                {v.victim}
              </td>
              <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">
                <Link
                  to={`/threatintel/actors/${encodeURIComponent(slugifyGroup(v.group))}`}
                  className="hover:text-brand-600 dark:hover:text-brand-400"
                >
                  {v.group}
                </Link>
              </td>
              <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">{v.sector ?? '—'}</td>
              <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">{v.country ?? '—'}</td>
              <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400 text-right tabular-nums">
                {v.discovered ? v.discovered.slice(0, 10) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Slug helper matching the convention used by /threatintel/actors/:slug ── */
function slugifyGroup(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
