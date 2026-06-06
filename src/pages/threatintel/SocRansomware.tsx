import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Skull, Users, Crosshair, ExternalLink } from 'lucide-react';
import { fetchJson } from '../../lib/fetch-json';
import { SocShell, SocKpi, SocSection, SocPanel, type SocTone } from '../../components/threatintel/soc/SocShell';
import { SocBar, SocDonut, type BarItem, type DonutSlice } from '../../components/threatintel/soc/SocCharts';
import { downloadCsv, dayKey } from '../../components/threatintel/soc/utils';

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

/* ─── Palette: ransomware = red family, with amber/pink accents ───── */

const SECTOR_COLORS: Record<string, string> = {
  Healthcare: '#fb7185', // rose-400
  Finance: '#f97316', // orange-500
  Government: '#ef4444', // red-500
  Technology: '#fbbf24', // amber-400
  Manufacturing: '#ec4899', // pink-500
  Education: '#f59e0b', // amber-500
  Retail: '#fb923c', // orange-400
  Energy: '#dc2626', // red-600
  'Professional Services': '#f43f5e', // rose-500
  Transportation: '#eab308', // yellow-500
  Media: '#facc15', // yellow-400
  Unknown: '#475569', // slate-600
};

function colorForSector(s: string): string {
  return SECTOR_COLORS[s] ?? '#94a3b8';
}

function colorForGroup(rank: number, total: number): string {
  // Gradient from vivid red at top → dim slate at bottom
  const t = total <= 1 ? 0 : rank / (total - 1);
  if (t < 0.15) return '#f87171'; // red-400
  if (t < 0.3) return '#fb7185'; // rose-400
  if (t < 0.5) return '#ec4899'; // pink-500
  if (t < 0.7) return '#f97316'; // orange-500
  if (t < 0.85) return '#fbbf24'; // amber-400
  return '#64748b'; // slate-500
}

function colorForCountry(_country: string, rank: number, total: number): string {
  const t = total <= 1 ? 0 : rank / (total - 1);
  if (t < 0.2) return '#f87171';
  if (t < 0.4) return '#fb7185';
  if (t < 0.6) return '#f97316';
  if (t < 0.8) return '#fbbf24';
  return '#eab308';
}

export default function SocRansomware(): JSX.Element {
  const [windowDays, setWindowDays] = useState<number>(30);
  const [data, setData] = useState<RansomwareResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  /** Previous count of victims (for delta chip). Captured on the prior successful load. */
  const [prevCount, setPrevCount] = useState<number | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const r = (await fetchJson(`/api/v1/ransomware-recent?days=${windowDays}`, {
          signal,
          cache: 'no-store',
        })) as RansomwareResponse;
        // Capture previous count before overwriting so the delta chip on the
        // KPI card compares "now" vs "30s ago" rather than always reading 0.
        setData((prev) => {
          if (prev) setPrevCount(prev.count);
          return r;
        });
        if (!r.victims || r.victims.length === 0) {
          setData(r);
        }
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
    return {
      total: data?.count ?? 0,
      groups: groups.length,
      topName: top?.group ?? '—',
      topPct: top ? `${topShare}%` : '—',
    };
  }, [data]);

  const delta = useMemo(() => {
    if (prevCount == null || !data) return null;
    const diff = data.count - prevCount;
    if (diff === 0) return { text: '0 vs last refresh', tone: 'slate' as const };
    return {
      text: `${diff > 0 ? '+' : ''}${diff} new since ${windowDays - 1}d ago`,
      tone: diff > 0 ? ('rose' as const) : ('emerald' as const),
    };
  }, [prevCount, data, windowDays]);

  /* ─── Status logic (DEFCON-style) ──────────────────────────────── */
  const status = useMemo<{ label: string; tone: SocTone }>(() => {
    if (!data) return { label: 'LOADING', tone: 'amber' };
    if (data.count === 0) return { label: 'SYSTEM: NOMINAL', tone: 'emerald' };
    if (kpis.topPct !== '—' && parseInt(kpis.topPct, 10) >= 20)
      return { label: 'DEFCON 2 — ACTIVE INTRUSIONS', tone: 'red' };
    if (data.count > 50) return { label: 'DEFCON 3 — ACTIVE INTRUSIONS DETECTED', tone: 'red' };
    if (data.count > 10) return { label: 'DEFCON 4 — ELEVATED ACTIVITY', tone: 'amber' };
    return { label: 'DEFCON 5 — LOW ACTIVITY', tone: 'emerald' };
  }, [data, kpis.topPct]);

  /* ─── Charts data ──────────────────────────────────────────────── */
  const groupBars: BarItem[] = useMemo(() => {
    const groups = data?.groups ?? [];
    return groups.slice(0, 12).map((g, i, arr) => ({
      label: g.group,
      value: g.count,
      color: colorForGroup(i, arr.length),
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
      color: colorForCountry(x.country, i, top.length),
    }));
    if (rest > 0) slices.push({ label: 'Other', value: rest, color: '#475569' });
    const unknown = victims.length - arr.reduce((s, x) => s + x.value, 0);
    if (unknown > 0) slices.push({ label: 'Unknown', value: unknown, color: '#334155' });
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
  const onItemClick = useCallback((it: BarItem) => {
    if (it.href) window.location.assign(it.href);
  }, []);

  const totalClaims = data?.count ?? 0;
  const totalGroups = data?.groups.length ?? 0;

  return (
    <SocShell
      title="INCIDENT RESPONSE / RANSOMWARE"
      tone="red"
      icon={<ShieldAlert size={20} />}
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
          Live aggregation from <code className="text-slate-700 dark:text-slate-300">/api/v1/ransomware-recent</code> ·
          source: <span className="uppercase">{data?.source ?? '—'}</span>
          {' · '}
          {data?.victims.length ?? 0} cross-claim records
        </span>
      }
    >
      {/* ─── KPI row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <SocKpi
          label="REGISTERED VICTIMS"
          value={totalClaims.toLocaleString()}
          tone="red"
          sub={`in last ${windowDays} days`}
          icon={<Skull size={16} />}
          delta={delta?.text}
          deltaTone={delta?.tone}
        />
        <SocKpi
          label="THREAT GROUPS"
          value={totalGroups}
          tone="amber"
          sub="distinct actors in window"
          icon={<Users size={16} />}
        />
        <SocKpi
          label="MAIN ACTOR"
          value={
            <span className="inline-flex items-baseline gap-2">
              <span className="truncate">{kpis.topName}</span>
              <span className="text-2xl text-slate-500 dark:text-slate-400">({kpis.topPct})</span>
            </span>
          }
          tone="rose"
          sub="share of total claims"
          icon={<Crosshair size={16} />}
        />
      </div>

      {/* ─── Charts row 1: actor bar + country donut + sector donut ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <SocPanel tone="red">
          <SocSection
            title="VOLUME BY ACTOR"
            tone="red"
            right={
              <Link
                to="/threatintel/actors"
                className="inline-flex items-center gap-1 text-meta font-mono text-slate-500 hover:text-brand-500"
              >
                all <ExternalLink size={10} />
              </Link>
            }
          />
          <SocBar items={groupBars} tone="red" axis onItemClick={onItemClick} />
        </SocPanel>

        <SocPanel tone="rose">
          <SocSection title="DISTRIBUTION BY COUNTRY" tone="rose" />
          {countrySlices.length > 0 ? (
            <SocDonut
              slices={countrySlices}
              size={180}
              thickness={26}
              centerLabel={
                <span>
                  {countrySlices[0]?.label ?? '—'}
                  <br />
                  <span className="text-meta font-mono text-slate-500">
                    {countrySlices[0] ? `${Math.round((countrySlices[0].value / victims.length) * 100)}%` : ''}
                  </span>
                </span>
              }
              centerSub="top country"
            />
          ) : (
            <p className="text-meta font-mono text-slate-500 italic">No country attribution in this window.</p>
          )}
        </SocPanel>

        <SocPanel tone="amber">
          <SocSection title="DISTRIBUTION BY SECTOR" tone="amber" />
          {sectorSlices.length > 0 ? (
            <SocDonut slices={sectorSlices} size={180} thickness={26} centerSub="by sector" />
          ) : (
            <p className="text-meta font-mono text-slate-500 italic">No sector attribution in this window.</p>
          )}
        </SocPanel>
      </div>

      {/* ─── Charts row 2: timeline + sector bars ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <SocPanel tone="red" className="lg:col-span-2">
          <SocSection
            title="CLAIM FREQUENCY (DAILY)"
            tone="red"
            right={
              <span className="text-meta font-mono text-slate-500">
                peak {Math.max(0, ...timeline.map((t) => t.value))} / day
              </span>
            }
          />
          <SocBar
            items={timeline.slice(-30).map((t) => ({ label: t.label, value: t.value }))}
            tone="red"
            vertical
            height={180}
            emptyText="No claims in this window."
          />
        </SocPanel>

        <SocPanel tone="amber">
          <SocSection
            title="SECTOR BREAKDOWN"
            tone="amber"
            right={<span className="text-meta font-mono text-slate-500">by share %</span>}
          />
          <SocBar
            items={(data?.sectors ?? []).slice(0, 8).map((s) => ({
              label: s.sector,
              value: s.count,
              hint: `${s.pct}%`,
              color: colorForSector(s.sector),
            }))}
            tone="amber"
          />
        </SocPanel>
      </div>

      {/* ─── Recent claims table ──────────────────────────────────── */}
      <div className="mt-6">
        <SocPanel tone="rose">
          <SocSection
            title="RECENT CLAIMS"
            tone="rose"
            right={
              <Link
                to="/threatintel/ransomware-activity"
                className="inline-flex items-center gap-1 text-meta font-mono text-slate-500 hover:text-brand-500"
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
          <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800">
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
              className="border-b border-slate-100 dark:border-slate-800/60 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-900/40"
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
                  className="hover:text-brand-500"
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
