import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bug,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  X,
} from 'lucide-react';
import { PageMeta } from '../../components/PageMeta';

const API = '/api/v1';

interface CveEntry {
  id: string;
  cvss: number;
  severity: string;
  description: string;
  kev: boolean;
  exploitStatus: string;
  published: string;
  cwe?: string[];
  products?: string[];
  epss?: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-rose-500',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-emerald-500',
  NONE: 'bg-slate-400',
};

const SEVERITY_PILL: Record<string, string> = {
  CRITICAL: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  HIGH: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  MEDIUM: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  LOW: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

const STATUS_FILTERS = ['all', 'kev', 'in_the_wild', 'weaponized', 'poc', 'none'] as const;

export default function CveBrowser() {
  const [cves, setCves] = useState<CveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [selectedCve, setSelectedCve] = useState<CveEntry | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/threat-intel/stats`);
      if (res.ok) {
        const data = await res.json();
        if (data.cves?.items) setCves(data.cves.items);
      }
    } catch (e) {
      console.error('CVE fetch failed:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    let items = cves;
    if (severityFilter !== 'all') items = items.filter((c) => c.severity === severityFilter);
    if (statusFilter === 'kev') items = items.filter((c) => c.kev);
    else if (statusFilter !== 'all') items = items.filter((c) => c.exploitStatus === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((c) => c.id.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
    }
    return items;
  }, [cves, severityFilter, statusFilter, search]);

  const PAGE_SIZE = 25;
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <>
      <PageMeta
        title="CVE Database"
        description="Browse 350K+ CVEs with CVSS, EPSS, and exploit status."
        canonicalPath="/cti/vulnerabilities"
      />
      <div className="min-h-screen bg-[rgb(var(--surface-100))] dark:bg-[rgb(var(--surface-100))]">
        <div className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center gap-3 mb-4">
              <Link
                to="/cti"
                className="p-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
              >
                <ArrowLeft size={16} className="text-slate-600 dark:text-slate-400" />
              </Link>
              <div className="w-10 h-10 rounded-lg bg-rose-600 flex items-center justify-center">
                <Bug size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">CVE Database</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {filtered.length.toLocaleString()} vulnerabilities
                </p>
              </div>
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Search CVE IDs, descriptions..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
              {search && (
                <button
                  onClick={() => {
                    setSearch('');
                    setPage(0);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X size={14} className="text-slate-400" />
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            {['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSeverityFilter(s);
                  setPage(0);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${severityFilter === s ? 'bg-brand-50 dark:bg-brand-950/30 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300' : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]'}`}
              >
                {s === 'all' ? 'All Severities' : s}
              </button>
            ))}
            <span className="border-l border-slate-200 dark:border-[rgb(var(--border-400))]" />
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(0);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${statusFilter === s ? 'bg-brand-50 dark:bg-brand-950/30 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300' : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]'}`}
              >
                {s === 'all' ? 'All Status' : s.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))]">
            {loading ? (
              <div className="p-12 text-center">
                <RefreshCw size={24} className="animate-spin text-slate-400 mx-auto" />
              </div>
            ) : paged.length === 0 ? (
              <div className="p-12 text-center">
                <Bug size={32} className="text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No CVEs match.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                      <th className="px-4 py-2.5 font-semibold">CVE ID</th>
                      <th className="px-4 py-2.5 font-semibold">CVSS</th>
                      <th className="px-4 py-2.5 font-semibold">Severity</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold">Description</th>
                      <th className="px-4 py-2.5 font-semibold">Published</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((cve) => (
                      <tr
                        key={cve.id}
                        className="border-b border-slate-100 dark:border-[rgb(var(--border-400))] last:border-0 hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] cursor-pointer"
                        onClick={() => setSelectedCve(selectedCve?.id === cve.id ? null : cve)}
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {cve.id}
                          </span>
                          {cve.kev && (
                            <span className="ml-2 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 rounded">
                              KEV
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs">{cve.cvss}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${SEVERITY_PILL[cve.severity] || ''}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_COLORS[cve.severity]}`} />
                            {cve.severity}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-slate-500">{cve.exploitStatus || '—'}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1 max-w-md">
                            {cve.description}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[11px] font-mono text-slate-400">
                            {cve.published ? new Date(cve.published).toLocaleDateString() : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                <span className="text-xs text-slate-500">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="p-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] disabled:opacity-30"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="p-1.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] disabled:opacity-30"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Detail Panel */}
          {selectedCve && (
            <div className="mt-4 rounded-xl bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Shield size={14} /> {selectedCve.id}
                </h3>
                <button onClick={() => setSelectedCve(null)}>
                  <X size={14} className="text-slate-400" />
                </button>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{selectedCve.description}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400">CVSS</label>
                  <p className="font-mono font-bold">{selectedCve.cvss}</p>
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400">Severity</label>
                  <p>{selectedCve.severity}</p>
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400">EPSS</label>
                  <p className="font-mono">{selectedCve.epss ? `${(selectedCve.epss * 100).toFixed(2)}%` : '—'}</p>
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400">Exploit</label>
                  <p>{selectedCve.exploitStatus || '—'}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <a
                  href={`https://nvd.nist.gov/vuln/detail/${selectedCve.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 flex items-center gap-1"
                >
                  NVD <ExternalLink size={10} />
                </a>
                <a
                  href={`https://www.cvedetails.com/cve/${selectedCve.id}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg hover:bg-slate-50 flex items-center gap-1"
                >
                  CVE Details <ExternalLink size={10} />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
