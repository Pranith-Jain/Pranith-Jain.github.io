import { useMemo, useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';

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

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'text-red-400';
    case 'high':
      return 'text-orange-400';
    case 'medium':
      return 'text-yellow-400';
    case 'low':
      return 'text-green-400';
    default:
      return 'text-gray-400';
  }
}

function priorityBar(score: number): string {
  if (score >= 80) return 'bg-red-500';
  if (score >= 50) return 'bg-orange-500';
  if (score >= 20) return 'bg-yellow-500';
  return 'bg-gray-500';
}

function hypeColor(hype: number): string {
  if (hype >= 70) return 'bg-purple-900/60 text-purple-300';
  if (hype >= 40) return 'bg-indigo-900/60 text-indigo-300';
  return 'bg-gray-800 text-gray-400';
}

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

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Threat Intel</h1>
          {indexData && (
            <div className="flex flex-wrap gap-4 text-sm text-gray-400">
              <span>{indexData.counts.cves} CVEs</span>
              <span>{indexData.counts.iocs} IOC families</span>
              <span>{indexData.counts.kevTotal} KEV</span>
              <span>{indexData.counts.sectors} sector briefs</span>
              {indexData.lastSyncedAt && (
                <span>Last synced: {new Date(indexData.lastSyncedAt).toLocaleDateString()}</span>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-800">
          {[
            { key: 'cves' as Tab, label: 'CVEs' },
            { key: 'kev' as Tab, label: 'KEV' },
            { key: 'iocs' as Tab, label: 'IOC Families' },
            { key: 'sectors' as Tab, label: 'Sector Briefs' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* CVE tab */}
        {tab === 'cves' && (
          <div>
            <input
              type="text"
              placeholder="Filter by CVE ID or keyword..."
              value={cveFilter}
              onChange={(e) => setCveFilter(e.target.value)}
              className="w-full mb-4 px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <div className="space-y-2">
              {filteredCves.map((cve) => (
                <div key={cve.cveId} className="bg-gray-900 border border-gray-800 rounded p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-blue-400">{cve.cveId}</span>
                        <span className={`text-xs font-medium ${severityColor(cve.cvssV3Severity)}`}>
                          {cve.cvssV3Severity?.toUpperCase()}
                        </span>
                        {cve.inKev && (
                          <span className="text-xs bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded">KEV</span>
                        )}
                        {cve.argusHypeScore != null && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${hypeColor(cve.argusHypeScore)}`} title={`Argus trending: ${cve.argusHypeScore}/100${cve.argusRising ? ` (rising ${cve.argusRising > 0 ? '+' : ''}${cve.argusRising})` : ''}`}>
                            {cve.argusHypeScore}{cve.argusRising ? (cve.argusRising > 0 ? '↑' : '↓') : ''}
                          </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${priorityBar(cve.priorityScore)}`}
                          style={{ width: `${Math.min(100, cve.priorityScore)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-8 text-right">{cve.priorityScore}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 line-clamp-2">{cve.description}</p>
                </div>
              ))}
              {!cvesLoading && filteredCves.length === 0 && <p className="text-gray-500 text-sm">No CVEs found</p>}
            </div>
          </div>
        )}

        {/* KEV tab */}
        {tab === 'kev' && (
          <div className="space-y-2">
            {kevData?.entries?.map((entry) => (
              <div key={entry.cveId} className="bg-gray-900 border border-gray-800 rounded p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-sm font-semibold text-red-400">{entry.cveId}</span>
                  <span className="text-xs text-gray-500">{entry.dateAdded}</span>
                </div>
                <p className="text-sm text-gray-300 mb-1">{entry.shortDescription || entry.name}</p>
                <p className="text-xs text-gray-500">
                  {entry.vendor} / {entry.product} — Due: {entry.dueDate || 'N/A'}
                </p>
              </div>
            ))}
            {!kevLoading && (!kevData?.entries || kevData.entries.length === 0) && (
              <p className="text-gray-500 text-sm">No KEV entries</p>
            )}
          </div>
        )}

        {/* IOC tab */}
        {tab === 'iocs' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {iocsData?.iocs?.map((ioc) => (
              <div key={ioc.slug} className="bg-gray-900 border border-gray-800 rounded p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-purple-400">{ioc.family}</span>
                  <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">{ioc.category}</span>
                </div>
                <p className="text-xs text-gray-500 mb-1">{ioc.indicatorCount} indicators</p>
                <p className="text-xs text-gray-400 line-clamp-2">{ioc.description}</p>
              </div>
            ))}
            {!iocsLoading && (!iocsData?.iocs || iocsData.iocs.length === 0) && (
              <p className="text-gray-500 text-sm">No IOC families</p>
            )}
          </div>
        )}

        {/* Sectors tab */}
        {tab === 'sectors' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sectorsData?.sectors?.map((s) => (
              <div key={s.sector} className="bg-gray-900 border border-gray-800 rounded p-4">
                <h3 className="text-lg font-semibold text-blue-400 mb-1 capitalize">{s.sector}</h3>
                <p className="text-xs text-gray-500 mb-3">Generated: {s.generatedAt}</p>
                <p className="text-sm text-gray-300 mb-2">{s.preview}</p>
                <p className="text-xs text-gray-500">{s.topCount} tracked threats</p>
              </div>
            ))}
            {!sectorsLoading && (!sectorsData?.sectors || sectorsData.sectors.length === 0) && (
              <p className="text-gray-500 text-sm">No sector briefs</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
