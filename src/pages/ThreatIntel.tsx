import { useMemo, useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Shield, AlertTriangle, Link2, Globe2 } from 'lucide-react';

interface TiIndexSummary {
  counts: { cves: number; iocs: number; sectors: number; kevTotal: number };
  source: string;
  license: string;
  lastSyncedAt: string | null;
}

interface CveEntry {
  cveId: string;
  publishedAt: string;
  cvssV3Score: number | null;
  cvssV3Severity: string;
  inKev: boolean;
  priorityScore: number;
  description: string;
  argusHypeScore: number | null;
  argusRising: number | null;
}

interface KevEntry {
  cveId: string;
  vendor: string;
  product: string;
  name: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  dueDate: string;
}

interface IocEntry {
  slug: string;
  family: string;
  category: string;
  indicatorCount: number;
  description: string;
}

interface SectorEntry {
  sector: string;
  title: string;
  generatedAt: string;
  topCount: number;
  preview: string;
}

type Tab = 'cves' | 'kev' | 'iocs' | 'sectors';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
  high: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800',
  medium: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  low: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
} as const;

const SEV_DEFAULT = 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800';

function severityPill(s: string): string {
  return SEVERITY_STYLES[s?.toLowerCase() ?? ''] ?? SEV_DEFAULT;
}

function priorityBar(score: number): string {
  if (score >= 80) return 'bg-rose-500';
  if (score >= 50) return 'bg-orange-500';
  if (score >= 20) return 'bg-amber-500';
  return 'bg-slate-400';
}

function hypeColor(hype: number): string {
  if (hype >= 70)
    return 'text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 border border-violet-300 dark:border-violet-800';
  if (hype >= 40)
    return 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-300 dark:border-indigo-800';
  return 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40 border border-slate-300 dark:border-slate-700';
}

const CARD =
  'rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1';

export default function ThreatIntel() {
  const [tab, setTab] = useState<Tab>('cves');
  const [cveFilter, setCveFilter] = useState('');

  const { data: indexData } = useDataFetch<TiIndexSummary>({ url: '/api/v1/threat-intel/' });
  const { data: cvesData, loading: cvesLoading } = useDataFetch<{ cves: CveEntry[] }>({
    url: '/api/v1/threat-intel/cves?limit=50',
  });
  const { data: kevData, loading: kevLoading } = useDataFetch<{ entries: KevEntry[] }>({
    url: '/api/v1/threat-intel/kev',
  });
  const { data: iocsData, loading: iocsLoading } = useDataFetch<{ iocs: IocEntry[] }>({
    url: '/api/v1/threat-intel/iocs?limit=50',
  });
  const { data: sectorsData, loading: sectorsLoading } = useDataFetch<{ sectors: SectorEntry[] }>({
    url: '/api/v1/threat-intel/sectors',
  });

  const filteredCves = useMemo(() => {
    if (!cvesData?.cves) return [];
    const needle = cveFilter.toLowerCase();
    return needle
      ? cvesData.cves.filter((c: CveEntry) => `${c.cveId} ${c.description}`.toLowerCase().includes(needle))
      : cvesData.cves;
  }, [cvesData, cveFilter]);

  const anyLoading = cvesLoading || kevLoading || iocsLoading || sectorsLoading;

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Shield className="h-6 w-6" />}
      title="Threat Intel"
      description="CVEs, KEV catalog, IOC families, and sector briefs from the threat intelligence vertical."
      maxWidthClass="max-w-6xl"
      loading={anyLoading && !cvesData && !kevData && !iocsData && !sectorsData}
      headerExtra={
        indexData && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
              {indexData.counts.cves} CVEs
            </span>
            <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
              {indexData.counts.iocs} IOC families
            </span>
            <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
              {indexData.counts.kevTotal} KEV
            </span>
            <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
              {indexData.counts.sectors} sectors
            </span>
          </div>
        )
      }
    >
      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[
          { key: 'cves' as Tab, label: 'CVEs', icon: AlertTriangle, count: cvesData?.cves?.length },
          { key: 'kev' as Tab, label: 'KEV', icon: Shield, count: kevData?.entries?.length },
          { key: 'iocs' as Tab, label: 'IOC Families', icon: Link2, count: iocsData?.iocs?.length },
          { key: 'sectors' as Tab, label: 'Sector Briefs', icon: Globe2, count: sectorsData?.sectors?.length },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 text-mini font-mono rounded-full border px-2.5 py-1 transition-colors ${
                tab === t.key
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
              {typeof t.count === 'number' && t.count > 0 && <span className="opacity-60">· {t.count}</span>}
            </button>
          );
        })}
      </div>

      {/* CVE tab */}
      {tab === 'cves' && (
        <div>
          <input
            type="text"
            placeholder="Filter by CVE ID or keyword…"
            value={cveFilter}
            onChange={(e) => setCveFilter(e.target.value)}
            className="w-full mb-4 px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
          />
          <div className="space-y-2">
            {filteredCves.map((cve) => (
              <div key={cve.cveId} className={`${CARD} p-3`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://nvd.nist.gov/vuln/detail/${cve.cveId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      {cve.cveId}
                    </a>
                    <span
                      className={`text-xs font-mono px-1.5 py-0.5 rounded border ${severityPill(cve.cvssV3Severity)}`}
                    >
                      {cve.cvssV3Severity?.toUpperCase()}
                    </span>
                    {cve.inKev && (
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300">
                        KEV
                      </span>
                    )}
                    {cve.argusHypeScore != null && (
                      <span
                        className={`text-xs font-mono px-1.5 py-0.5 rounded ${hypeColor(cve.argusHypeScore)}`}
                        title={`Argus trending: ${cve.argusHypeScore}/100${cve.argusRising ? ` (rising ${cve.argusRising > 0 ? '+' : ''}${cve.argusRising})` : ''}`}
                      >
                        {cve.argusHypeScore}
                        {cve.argusRising ? (cve.argusRising > 0 ? '↑' : '↓') : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${priorityBar(cve.priorityScore)}`}
                        style={{ width: `${Math.min(100, cve.priorityScore)}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 w-8 text-right font-mono">
                      {cve.priorityScore}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{cve.description}</p>
              </div>
            ))}
            {!cvesLoading && filteredCves.length === 0 && (
              <div className={`${CARD} p-8 text-center text-sm text-slate-500 dark:text-slate-400`}>No CVEs found</div>
            )}
          </div>
        </div>
      )}

      {/* KEV tab */}
      {tab === 'kev' && (
        <div className="space-y-2">
          {kevData?.entries?.map((entry) => (
            <div key={entry.cveId} className={`${CARD} p-3`}>
              <div className="flex items-center justify-between mb-1">
                <a
                  href={`https://nvd.nist.gov/vuln/detail/${entry.cveId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm font-semibold text-rose-600 dark:text-rose-400 hover:underline"
                >
                  {entry.cveId}
                </a>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{entry.dateAdded}</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200 mb-1">{entry.shortDescription || entry.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {entry.vendor} / {entry.product} — Due: {entry.dueDate || 'N/A'}
              </p>
            </div>
          ))}
          {!kevLoading && (!kevData?.entries || kevData.entries.length === 0) && (
            <div className={`${CARD} p-8 text-center text-sm text-slate-500 dark:text-slate-400`}>No KEV entries</div>
          )}
        </div>
      )}

      {/* IOC tab */}
      {tab === 'iocs' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {iocsData?.iocs?.map((ioc) => (
            <div key={ioc.slug} className={`${CARD} p-3`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">{ioc.family}</span>
                <span className="text-micro font-mono uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                  {ioc.category}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{ioc.indicatorCount} indicators</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{ioc.description}</p>
            </div>
          ))}
          {!iocsLoading && (!iocsData?.iocs || iocsData.iocs.length === 0) && (
            <div className={`${CARD} p-8 text-center text-sm text-slate-500 dark:text-slate-400`}>No IOC families</div>
          )}
        </div>
      )}

      {/* Sectors tab */}
      {tab === 'sectors' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {sectorsData?.sectors?.map((s) => (
            <div key={s.sector} className={`${CARD} p-4`}>
              <h3 className="text-lg font-semibold text-brand-600 dark:text-brand-400 mb-1 capitalize">{s.sector}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-3">Generated: {s.generatedAt}</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 mb-2">{s.preview}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{s.topCount} tracked threats</p>
            </div>
          ))}
          {!sectorsLoading && (!sectorsData?.sectors || sectorsData.sectors.length === 0) && (
            <div className={`${CARD} p-8 text-center text-sm text-slate-500 dark:text-slate-400`}>No sector briefs</div>
          )}
        </div>
      )}
    </DataPageLayout>
  );
}
