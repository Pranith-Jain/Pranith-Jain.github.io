import { useMemo, useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import {
  Shield,
  AlertTriangle,
  Link2,
  Globe2,
  Download,
  ChevronRight,
  Search as SearchIcon,
  Globe,
  Loader2,
  ExternalLink,
} from 'lucide-react';

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
  firstSeen: string | null;
  mitreTechniques: string[];
}

interface IocDetail {
  slug: string;
  family: string;
  category: string;
  indicatorCount: number;
  description: string;
  firstSeen: string | null;
  mitreTechniques: string[];
  indicators: Array<{ type: string; value: string; firstSeen: string | null; confidence: string }>;
  context: string;
  references: string[];
}

interface SectorEntry {
  sector: string;
  title: string;
  generatedAt: string;
  topCount: number;
  preview: string;
}

type Tab = 'cves' | 'kev' | 'iocs' | 'sectors' | 'search' | 'darkweb';

type DarkwebTool = 'multi-search' | 'onion-lookup' | 'crawl' | 'scrape-deep' | 'tor-exit';

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

const CARD = 'surface-card';

export default function ThreatIntel() {
  const [tab, setTab] = useState<Tab>('cves');
  const [cveFilter, setCveFilter] = useState('');
  const [selectedIoc, setSelectedIoc] = useState<string | null>(null);
  const [iocFilter, setIocFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchProvider, setSearchProvider] = useState<'otx' | 'threatfox' | 'malwarebazaar' | 'ransomware'>(
    'threatfox'
  );
  const [searchResults, setSearchResults] = useState<Record<string, unknown> | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [dwTool, setDwTool] = useState<DarkwebTool>('multi-search');
  const [dwQuery, setDwQuery] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dwResults, setDwResults] = useState<any>(null);
  const [dwLoading, setDwLoading] = useState(false);
  const [dwError, setDwError] = useState<string | null>(null);

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

  const { data: iocDetail, loading: iocDetailLoading } = useDataFetch<IocDetail>({
    url: selectedIoc ? `/api/v1/threat-intel/iocs/${selectedIoc}` : '',
  });

  const filteredIocs = useMemo(() => {
    if (!iocsData?.iocs) return [];
    const needle = iocFilter.toLowerCase();
    return needle
      ? iocsData.iocs.filter((i: IocEntry) =>
          `${i.family} ${i.category} ${i.description}`.toLowerCase().includes(needle)
        )
      : iocsData.iocs;
  }, [iocsData, iocFilter]);

  const downloadStix = async (slug: string) => {
    try {
      const res = await fetch(`/api/v1/threat-intel/iocs/${slug}`);
      if (!res.ok) return;
      const body = await res.json();
      const now = new Date().toISOString();
      const typeMap: Record<string, string> = {
        ipv4: 'ipv4-addr',
        ipv6: 'ipv6-addr',
        domain: 'domain-name',
        email: 'email-addr',
        md5: 'file:hashes.MD5',
        sha1: 'file:hashes.SHA-1',
        sha256: 'file:hashes.SHA-256',
        onion: 'domain-name',
      };
      const stixPattern = (t: string, v: string) => {
        const m: Record<string, string> = {
          'ipv4-addr': `[ipv4-addr:value = '${v}']`,
          'ipv6-addr': `[ipv6-addr:value = '${v}']`,
          'domain-name': `[domain-name:value = '${v}']`,
          'email-addr': `[email-addr:value = '${v}']`,
          'file:hashes.MD5': `[file:hashes.MD5 = '${v}']`,
          'file:hashes.SHA-1': `[file:hashes.'SHA-1' = '${v}']`,
          'file:hashes.SHA-256': `[file:hashes.'SHA-256' = '${v}']`,
        };
        return m[t] || `[artifact:payload_bin = '${v}']`;
      };
      const objects: Record<string, unknown>[] = [];
      const identityId = `identity--${crypto.randomUUID().slice(0, 8)}`;
      objects.push({
        type: 'identity',
        spec_version: '2.1',
        id: identityId,
        created: now,
        modified: now,
        name: 'PANOPTICON TI',
        identity_class: 'organization',
      });
      const markerId = `marking-definition--${crypto.randomUUID().slice(0, 8)}`;
      objects.push({
        type: 'marking-definition',
        spec_version: '2.1',
        id: markerId,
        created: now,
        definition_type: 'tlp',
        definition: { tlp: 'GREEN' },
      });
      const reportId = `report--${crypto.randomUUID().slice(0, 8)}`;
      const objectRefs: string[] = [];
      for (const ind of (body.indicators ?? []).slice(0, 200)) {
        const stixType = typeMap[ind.type] || ind.type;
        const indId = `indicator--${crypto.randomUUID().slice(0, 8)}`;
        objects.push({
          type: 'indicator',
          spec_version: '2.1',
          id: indId,
          created: now,
          modified: now,
          name: `${body.family} — ${ind.type}`,
          description: `IOC from ${body.family}`,
          pattern: stixPattern(stixType, ind.value),
          pattern_type: 'stix',
          valid_from: now,
          created_by_ref: identityId,
          object_marking_refs: [markerId],
          confidence: 50,
          labels: [body.category, body.family],
        });
        objectRefs.push(indId);
      }
      objects.push({
        type: 'report',
        spec_version: '2.1',
        id: reportId,
        created: now,
        modified: now,
        name: `${body.family} — STIX Export`,
        published: now,
        created_by_ref: identityId,
        object_refs: objectRefs,
      });
      const bundle = {
        type: 'bundle',
        id: `bundle--${crypto.randomUUID().slice(0, 8)}`,
        spec_version: '2.1',
        created: now,
        objects,
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/stix+json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}-stix.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* ignore */
    }
  };

  const runSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchResults(null);
    try {
      const endpoints: Record<'otx' | 'threatfox' | 'malwarebazaar' | 'ransomware', string> = {
        otx: `/api/v1/threat-intel/search/otx?q=${encodeURIComponent(searchQuery)}`,
        threatfox: `/api/v1/threat-intel/search/threatfox?q=${encodeURIComponent(searchQuery)}`,
        malwarebazaar: `/api/v1/threat-intel/search/malwarebazaar?q=${encodeURIComponent(searchQuery)}`,
        ransomware: `/api/v1/threat-intel/search/ransomware-live?q=${encodeURIComponent(searchQuery)}`,
      };
      const res = await fetch(endpoints[searchProvider]);
      if (res.ok) setSearchResults(await res.json());
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* ignore */
    }
    setSearchLoading(false);
  };

  const runDarkwebSearch = async () => {
    if (!dwQuery.trim()) return;
    setDwLoading(true);
    setDwError(null);
    setDwResults(null);
    try {
      const q = dwQuery.trim();
      let url: string;
      switch (dwTool) {
        case 'multi-search':
          url = `/api/v1/darkweb-osint/search?q=${encodeURIComponent(q)}&limit=30`;
          break;
        case 'onion-lookup':
          url = `/api/v1/darkweb-osint/onion-lookup?address=${encodeURIComponent(q)}`;
          break;
        case 'crawl':
          url = `/api/v1/darkweb-osint/crawl?url=${encodeURIComponent(q)}&depth=2&pages=10`;
          break;
        case 'scrape-deep':
          url = `/api/v1/darkweb-osint/scrape?url=${encodeURIComponent(q)}`;
          break;
        case 'tor-exit':
          url = `/api/v1/darkweb-osint/tor-exit?ip=${encodeURIComponent(q)}`;
          break;
        default:
          return;
      }
      const res = await fetch(url);
      if (!res.ok) {
        setDwError(`Request failed: HTTP ${res.status}`);
        return;
      }
      setDwResults(await res.json());
    } catch (e) {
      setDwError(e instanceof Error ? e.message : 'Request failed');
    }
    setDwLoading(false);
  };

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
          { key: 'search' as Tab, label: 'Live Search', icon: SearchIcon },
          { key: 'darkweb' as Tab, label: 'Dark Web', icon: Globe },
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
                    <div className="w-24 h-1.5 bg-slate-100 dark:bg-[rgb(var(--surface-200))] rounded-full overflow-hidden">
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
        <div>
          <input
            type="text"
            placeholder="Filter by family, category, or keyword…"
            value={iocFilter}
            onChange={(e) => setIocFilter(e.target.value)}
            className="w-full mb-4 px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredIocs.map((ioc) => (
              <div
                key={ioc.slug}
                className={`${CARD} p-3 cursor-pointer hover:border-violet-400 dark:hover:border-violet-600 transition-colors`}
                onClick={() => setSelectedIoc(selectedIoc === ioc.slug ? null : ioc.slug)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-violet-600 dark:text-violet-400">{ioc.family}</span>
                    <ChevronRight
                      className={`h-3 w-3 text-slate-400 transition-transform ${selectedIoc === ioc.slug ? 'rotate-90' : ''}`}
                    />
                  </div>
                  <span className="text-micro font-mono uppercase tracking-wider bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
                    {ioc.category}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-1">
                  <span className="font-mono">{ioc.indicatorCount} indicators</span>
                  {ioc.firstSeen && <span>First seen: {ioc.firstSeen.slice(0, 10)}</span>}
                  {ioc.mitreTechniques?.length > 0 && <span>{ioc.mitreTechniques.length} MITRE TTPs</span>}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{ioc.description}</p>

                {/* Expanded detail view */}
                {selectedIoc === ioc.slug && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                    {iocDetailLoading ? (
                      <p className="text-xs text-slate-400">Loading indicators…</p>
                    ) : iocDetail ? (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {iocDetail.indicators.length} extracted indicators
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadStix(ioc.slug);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40"
                          >
                            <Download className="h-3 w-3" /> STIX 2.1
                          </button>
                        </div>
                        {/* Indicator type breakdown */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {Object.entries(
                            iocDetail.indicators.reduce((acc: Record<string, number>, i) => {
                              acc[i.type] = (acc[i.type] || 0) + 1;
                              return acc;
                            }, {})
                          ).map(([type, count]) => (
                            <span
                              key={type}
                              className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-300"
                            >
                              {type}: {count}
                            </span>
                          ))}
                        </div>
                        {/* Sample indicators */}
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {iocDetail.indicators.slice(0, 15).map((ind, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-mono text-xs">
                              <span className="text-violet-500 dark:text-violet-400 w-14 shrink-0">{ind.type}</span>
                              <span className="text-slate-700 dark:text-slate-200 truncate">{ind.value}</span>
                            </div>
                          ))}
                          {iocDetail.indicators.length > 15 && (
                            <p className="text-xs text-slate-400">…and {iocDetail.indicators.length - 15} more</p>
                          )}
                        </div>
                        {/* MITRE techniques */}
                        {iocDetail.mitreTechniques.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {iocDetail.mitreTechniques.map((t) => (
                              <a
                                key={t}
                                href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-micro font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {t}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No detail available</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {!iocsLoading && filteredIocs.length === 0 && (
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

      {/* Live Search tab */}
      {tab === 'search' && (
        <div>
          <div className={`${CARD} p-4 mb-4`}>
            <div className="flex flex-wrap gap-2 mb-3">
              {[
                { key: 'threatfox' as const, label: 'ThreatFox', desc: 'Crowdsourced IOCs' },
                { key: 'otx' as const, label: 'AlienVault OTX', desc: 'Threat pulses' },
                { key: 'malwarebazaar' as const, label: 'MalwareBazaar', desc: 'Malware samples' },
                { key: 'ransomware' as const, label: 'ransomware.live', desc: 'Group profiles' },
              ].map((p) => (
                <button
                  key={p.key}
                  onClick={() => setSearchProvider(p.key)}
                  className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
                    searchProvider === p.key
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300'
                      : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={
                  searchProvider === 'ransomware'
                    ? 'e.g. LockBit, BlackCat, Cl0p…'
                    : 'e.g. Emotet, CVE-2024-1234, 1.2.3.4…'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                className="flex-1 px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
              />
              <button
                onClick={runSearch}
                disabled={searchLoading || !searchQuery.trim()}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {searchLoading ? 'Searching…' : 'Search'}
              </button>
            </div>
          </div>

          {/* Search results */}
          {searchResults && (
            <div className={`${CARD} p-4`}>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
                Results from {searchProvider === 'ransomware' ? 'ransomware.live' : searchProvider}
              </h3>
              <pre className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[rgb(var(--surface-100))] rounded-lg p-3 overflow-x-auto max-h-96 overflow-y-auto">
                {JSON.stringify(searchResults, null, 2)}
              </pre>
            </div>
          )}
          {!searchLoading && !searchResults && (
            <div className={`${CARD} p-8 text-center text-sm text-slate-500 dark:text-slate-400`}>
              Search across OTX, ThreatFox, MalwareBazaar, and ransomware.live. Results include IOCs, malware families,
              and group profiles.
            </div>
          )}
        </div>
      )}

      {/* Dark Web OSINT tab (TorBot / darkdump integration) */}
      {tab === 'darkweb' && (
        <div>
          <div className={`${CARD} p-4 mb-4`}>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 font-mono">
              Native TorBot + darkdump tools — multi-engine .onion search, depth-limited crawl with link tree, deep
              scraping with email/metadata harvest, onion service lookup.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {(
                [
                  { id: 'multi-search', label: 'Multi-Engine Search', desc: 'Ahmia + OnionLand + Tor66 + DarkWebLink' },
                  { id: 'crawl', label: 'Crawl & Link Tree', desc: 'BFS crawl with depth limit (TorBot-style)' },
                  { id: 'scrape-deep', label: 'Deep Scrape', desc: 'Full page scrape with email/metadata extraction' },
                  { id: 'onion-lookup', label: 'Onion Lookup', desc: 'CIRCL AIL hidden service metadata' },
                  { id: 'tor-exit', label: 'Tor Exit Check', desc: 'Check if IP is a Tor exit node' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setDwTool(t.id);
                    setDwResults(null);
                    setDwError(null);
                  }}
                  className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
                    dwTool === t.id
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'
                  }`}
                  title={t.desc}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder={
                  dwTool === 'multi-search'
                    ? 'e.g. marketplace, leak, forum, carding…'
                    : dwTool === 'onion-lookup'
                      ? '.onion address to look up metadata'
                      : dwTool === 'crawl'
                        ? '.onion URL to crawl (BFS link tree)'
                        : dwTool === 'scrape-deep'
                          ? '.onion URL to deep-scrape'
                          : 'IP address to check, e.g. 185.220.101.1'
                }
                value={dwQuery}
                onChange={(e) => setDwQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runDarkwebSearch()}
                className="flex-1 px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
              />
              <button
                onClick={runDarkwebSearch}
                disabled={dwLoading || !dwQuery.trim()}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {dwLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchIcon className="h-3.5 w-3.5" />}
                {dwLoading ? 'Searching…' : 'Search'}
              </button>
            </div>
          </div>

          {/* Dark web results */}
          {dwError && (
            <div className={`${CARD} p-4 border-rose-300 dark:border-rose-800`}>
              <p className="text-sm text-rose-600 dark:text-rose-400">{dwError}</p>
            </div>
          )}
          {dwResults && dwTool === 'multi-search' && (
            <DarkwebMultiSearchResults
              data={
                dwResults as {
                  query: string;
                  engines_queried: string[];
                  total_results: number;
                  results: Array<{ engine: string; title: string; url: string; description: string }>;
                  errors: Array<{ engine: string; error: string }>;
                }
              }
            />
          )}
          {dwResults && dwTool === 'crawl' && (
            <DarkwebCrawlResults
              data={
                dwResults as {
                  seed_url: string;
                  pages_crawled: number;
                  pages: Array<{
                    url: string;
                    title: string;
                    status_code: number;
                    body_text: string;
                    links: Array<{ text: string; href: string; is_onion: boolean }>;
                    emails: string[];
                    depth: number;
                  }>;
                  all_emails: string[];
                  all_onion_refs: string[];
                  link_tree: Array<{ parent: string; children: Array<{ href: string; text: string }> }>;
                }
              }
            />
          )}
          {dwResults && dwTool === 'scrape-deep' && (
            <DarkwebScrapeDeepResults
              data={
                dwResults as {
                  url: string;
                  title: string;
                  status_code: number;
                  fetched_via: string;
                  body_text: string;
                  links: Array<{ text: string; href: string; is_onion: boolean }>;
                  emails: string[];
                  onion_refs: string[];
                  metadata: {
                    description: string | null;
                    keywords: string[];
                    og_title: string | null;
                    og_description: string | null;
                    language: string | null;
                  };
                }
              }
            />
          )}
          {dwResults && dwTool === 'onion-lookup' && (
            <DarkwebOnionLookup
              data={
                dwResults as {
                  address: string;
                  status: string | null;
                  first_seen: string | null;
                  last_seen: string | null;
                  title: string | null;
                  tags: string[];
                  ports: number[];
                  bitcoin_addresses: string[];
                }
              }
            />
          )}
          {dwResults && dwTool === 'tor-exit' && (
            <DarkwebTorExitResult data={dwResults as { isTorExit: boolean; ip: string }} />
          )}
          {!dwLoading && !dwResults && !dwError && (
            <div className={`${CARD} p-8 text-center text-sm text-slate-500 dark:text-slate-400`}>
              <p className="mb-2">
                <strong>Multi-Engine Search</strong> — query Ahmia, OnionLand, Tor66, DarkWebLink simultaneously (like
                darkdump).
              </p>
              <p className="mb-2">
                <strong>Crawl & Link Tree</strong> — BFS crawl starting from a .onion URL, builds link tree with email
                harvesting (TorBot core).
              </p>
              <p className="mb-2">
                <strong>Deep Scrape</strong> — fetch a single .onion page with full metadata, email extraction, keyword
                parsing (darkdump -s).
              </p>
              <p className="mb-2">
                <strong>Onion Lookup</strong> — CIRCL AIL metadata for hidden services (status, tags, ports, BTC
                addresses).
              </p>
              <p>
                <strong>Tor Exit Check</strong> — verify if an IP is a known Tor exit node.
              </p>
            </div>
          )}
        </div>
      )}
    </DataPageLayout>
  );
}

// ─── Dark Web Result Components ─────────────────────────────────────────

function DarkwebMultiSearchResults({
  data,
}: {
  data: {
    query: string;
    engines_queried: string[];
    total_results: number;
    results: Array<{ engine: string; title: string; url: string; description: string }>;
    errors: Array<{ engine: string; error: string }>;
  };
}) {
  const engineCounts = data.results.reduce(
    (acc, r) => {
      acc[r.engine] = (acc[r.engine] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-3">
      <div className={`${CARD} p-3`}>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="text-slate-500 dark:text-slate-400">
            {data.total_results} result{data.total_results !== 1 ? 's' : ''} for "{data.query}"
          </span>
          {Object.entries(engineCounts).map(([engine, count]) => (
            <span
              key={engine}
              className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
            >
              {engine}: {count}
            </span>
          ))}
          {data.errors.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {data.errors.length} engine{data.errors.length !== 1 ? 's' : ''} failed
            </span>
          )}
        </div>
      </div>

      {data.results.length === 0 ? (
        <div className={`${CARD} p-6 text-center text-sm text-slate-500 dark:text-slate-400`}>
          No .onion results found across queried engines
        </div>
      ) : (
        data.results.map((r, i) => (
          <div
            key={i}
            className={`${CARD} p-3 hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors`}
          >
            <div className="flex items-center justify-between mb-1">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
              >
                {r.title || 'Untitled'}
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
              <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-500 dark:text-slate-400">
                {r.engine}
              </span>
            </div>
            {r.description && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{r.description}</p>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 truncate font-mono">{r.url}</p>
          </div>
        ))
      )}
    </div>
  );
}

function DarkwebCrawlResults({
  data,
}: {
  data: {
    seed_url: string;
    pages_crawled: number;
    pages: Array<{
      url: string;
      title: string;
      status_code: number;
      body_text: string;
      links: Array<{ text: string; href: string; is_onion: boolean }>;
      emails: string[];
      depth: number;
    }>;
    all_emails: string[];
    all_onion_refs: string[];
    link_tree: Array<{ parent: string; children: Array<{ href: string; text: string }> }>;
  };
}) {
  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className={`${CARD} p-3`}>
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
            {data.pages_crawled} page{data.pages_crawled !== 1 ? 's' : ''} crawled
          </span>
          <span className="text-slate-500 dark:text-slate-400">seed: {data.seed_url}</span>
          {data.all_emails.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              {data.all_emails.length} email{data.all_emails.length !== 1 ? 's' : ''}
            </span>
          )}
          {data.all_onion_refs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
              {data.all_onion_refs.length} onion ref{data.all_onion_refs.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Collected emails */}
      {data.all_emails.length > 0 && (
        <div className={`${CARD} p-3`}>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
            Harvested Emails ({data.all_emails.length})
          </h4>
          <div className="flex flex-wrap gap-1">
            {data.all_emails.map((email) => (
              <span
                key={email}
                className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
              >
                {email}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Link tree */}
      {data.link_tree.length > 0 && (
        <div className={`${CARD} p-3`}>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
            Link Tree ({data.link_tree.length} parent{data.link_tree.length !== 1 ? 's' : ''})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {data.link_tree.map((node, i) => (
              <div key={i} className="text-xs">
                <span className="text-emerald-600 dark:text-emerald-400 font-mono">{node.parent}</span>
                <span className="text-slate-400 mx-1">→</span>
                <span className="text-slate-500 dark:text-slate-400">
                  {node.children.length} child{node.children.length !== 1 ? 'ren' : ''}
                </span>
                {node.children.slice(0, 3).map((child, j) => (
                  <div key={j} className="ml-4 text-slate-500 dark:text-slate-400 truncate">
                    → {child.text || child.href}
                  </div>
                ))}
                {node.children.length > 3 && (
                  <div className="ml-4 text-slate-400">…and {node.children.length - 3} more</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Crawled pages */}
      {data.pages.map((page, i) => (
        <div key={i} className={`${CARD} p-3`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{page.title || 'Untitled'}</span>
            <div className="flex items-center gap-2">
              <span className="text-micro font-mono text-slate-400">depth {page.depth}</span>
              <span
                className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                  page.status_code >= 200 && page.status_code < 300
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                }`}
              >
                {page.status_code || 'ERR'}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 font-mono truncate mb-1">{page.url}</p>
          {page.emails.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {page.emails.map((e) => (
                <span key={e} className="text-micro font-mono text-amber-600 dark:text-amber-400">
                  {e}
                </span>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{page.body_text}</p>
        </div>
      ))}
    </div>
  );
}

function DarkwebScrapeDeepResults({
  data,
}: {
  data: {
    url: string;
    title: string;
    status_code: number;
    fetched_via: string;
    body_text: string;
    links: Array<{ text: string; href: string; is_onion: boolean }>;
    emails: string[];
    onion_refs: string[];
    metadata: {
      description: string | null;
      keywords: string[];
      og_title: string | null;
      og_description: string | null;
      language: string | null;
    };
  };
}) {
  return (
    <div className="space-y-3">
      <div className={`${CARD} p-3`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{data.title || 'Untitled page'}</h3>
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded ${
              data.status_code >= 200 && data.status_code < 300
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
            }`}
          >
            HTTP {data.status_code}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-1">{data.url}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-mono">Fetched via: {data.fetched_via}</p>
      </div>

      {/* Metadata */}
      {(data.metadata.description || data.metadata.og_title || data.metadata.keywords.length > 0) && (
        <div className={`${CARD} p-3`}>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">Metadata</h4>
          {data.metadata.og_title && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-1">
              <span className="text-slate-400">og:title:</span> {data.metadata.og_title}
            </p>
          )}
          {data.metadata.description && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-1 line-clamp-2">
              <span className="text-slate-400">description:</span> {data.metadata.description}
            </p>
          )}
          {data.metadata.og_description && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-1 line-clamp-2">
              <span className="text-slate-400">og:desc:</span> {data.metadata.og_description}
            </p>
          )}
          {data.metadata.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {data.metadata.keywords.map((kw) => (
                <span
                  key={kw}
                  className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-300"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Emails */}
      {data.emails.length > 0 && (
        <div className={`${CARD} p-3`}>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
            Emails ({data.emails.length})
          </h4>
          <div className="flex flex-wrap gap-1">
            {data.emails.map((e) => (
              <span
                key={e}
                className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
              >
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Body content */}
      {data.body_text && (
        <div className={`${CARD} p-3`}>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
            Page content <span className="font-normal text-slate-400">(truncated)</span>
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-8 whitespace-pre-wrap">
            {data.body_text}
          </p>
        </div>
      )}

      {/* Links */}
      {data.links.length > 0 && (
        <div className={`${CARD} p-3`}>
          <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
            Links <span className="font-normal text-slate-400">({data.links.length})</span>
          </h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {data.links.slice(0, 30).map((link, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {link.is_onion && (
                  <span className="text-micro font-mono px-1 py-0.5 rounded bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400">
                    .onion
                  </span>
                )}
                <span className="text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{link.text}</span>
                <span className="text-slate-400 dark:text-slate-500">→</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-mono truncate">{link.href}</span>
              </div>
            ))}
            {data.links.length > 30 && (
              <p className="text-xs text-slate-400">…and {data.links.length - 30} more links</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DarkwebOnionLookup({
  data,
}: {
  data: {
    address: string;
    status: string | null;
    first_seen: string | null;
    last_seen: string | null;
    title: string | null;
    tags: string[];
    ports: number[];
    bitcoin_addresses: string[];
  };
}) {
  return (
    <div className={`${CARD} p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <span
          className={`text-xs font-mono px-2 py-0.5 rounded ${
            data.status === 'online'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
              : data.status === 'offline'
                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                : 'bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-[rgb(var(--border-400))]'
          }`}
        >
          {data.status ?? 'unknown'}
        </span>
        <span className="text-sm text-slate-800 dark:text-slate-200 font-mono">{data.address}</span>
      </div>

      {(data.first_seen || data.last_seen) && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          {data.first_seen && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">First seen</span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5 font-mono">{data.first_seen}</p>
            </div>
          )}
          {data.last_seen && (
            <div>
              <span className="text-slate-500 dark:text-slate-400">Last seen</span>
              <p className="text-slate-700 dark:text-slate-300 mt-0.5 font-mono">{data.last_seen}</p>
            </div>
          )}
        </div>
      )}

      {data.title && (
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Title</span>
          <p className="text-sm text-slate-700 dark:text-slate-200 mt-0.5">{data.title}</p>
        </div>
      )}

      {data.tags.length > 0 && (
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Tags</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {data.tags.map((t, i) => (
              <span
                key={i}
                className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-300"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.ports.length > 0 && (
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Open ports</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {data.ports.map((p) => (
              <span
                key={p}
                className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-300"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {data.bitcoin_addresses.length > 0 && (
        <div>
          <span className="text-xs text-slate-500 dark:text-slate-400">BTC addresses</span>
          {data.bitcoin_addresses.map((addr) => (
            <p key={addr} className="text-xs text-amber-700 dark:text-amber-400 font-mono mt-0.5">
              {addr}
            </p>
          ))}
        </div>
      )}

      {!data.first_seen && !data.last_seen && data.tags.length === 0 && data.ports.length === 0 && !data.title && (
        <p className="text-xs text-slate-500 dark:text-slate-400">No metadata available for this address.</p>
      )}
    </div>
  );
}

function DarkwebTorExitResult({ data }: { data: { isTorExit: boolean; ip: string } }) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center gap-3">
        <span
          className={`text-sm font-mono px-3 py-1 rounded-lg ${
            data.isTorExit
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
          }`}
        >
          {data.isTorExit ? 'TOR EXIT NODE' : 'NOT A TOR EXIT NODE'}
        </span>
        <span className="text-sm text-slate-700 dark:text-slate-300 font-mono">{data.ip}</span>
      </div>
    </div>
  );
}
