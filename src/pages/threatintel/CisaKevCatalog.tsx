import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Flame, Hash, RefreshCw, Search, ShieldAlert, Skull } from 'lucide-react';
import { useDataFetch } from '../../hooks/useDataFetch';
import { DataState } from '../../components/DataState';
import { relativeAgo } from '../../lib/relativeTime';

interface KevVulnerability {
  cve_id: string;
  vendor_project: string;
  product: string;
  vulnerability_name: string;
  date_added: string;
  short_description: string;
  due_date: string;
  known_ransomware_campaign_use: string;
}

interface KevResponse {
  total: number;
  vulnerabilities: KevVulnerability[];
  catalog_version: string;
  date_released: string;
  timestamp: string;
}

type SortKey = 'date_added' | 'due_date' | 'vendor_project' | 'cve_id' | 'product';
type SortDir = 'asc' | 'desc';

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00Z').getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function isOverdue(dateStr: string): boolean {
  return daysUntil(dateStr) < 0;
}

export default function CisaKevCatalog(): JSX.Element {
  const [query, setQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [ransomwareOnly, setRansomwareOnly] = useState(false);
  const [daysFilter, setDaysFilter] = useState<number | ''>('');
  const [sortKey, setSortKey] = useState<SortKey>('date_added');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const PER_PAGE = 50;

  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (vendorFilter.trim()) params.set('vendor', vendorFilter.trim());
  if (productFilter.trim()) params.set('product', productFilter.trim());
  if (ransomwareOnly) params.set('ransomware_only', 'true');
  if (daysFilter !== '') params.set('days', String(daysFilter));

  const qs = params.toString();
  const url = `/api/v1/cisa-kev${qs ? `?${qs}` : ''}`;

  const { data, loading, error, refetch } = useDataFetch<KevResponse>({
    url,
    ttl: 300_000,
    staleWhileRevalidate: true,
  });

  useEffect(() => {
    setPage(0);
  }, [query, vendorFilter, productFilter, ransomwareOnly, daysFilter]);

  const sorted = useMemo(() => {
    if (!data) return [];
    const items = [...data.vulnerabilities];
    items.sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      const cmp = aVal.localeCompare(bVal);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return items;
  }, [data, sortKey, sortDir]);

  const paged = useMemo(() => sorted.slice(page * PER_PAGE, (page + 1) * PER_PAGE), [sorted, page]);
  const totalPages = Math.ceil(sorted.length / PER_PAGE);

  const vendors = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const v of data.vulnerabilities) {
      counts.set(v.vendor_project, (counts.get(v.vendor_project) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, ransomware: 0, overdue: 0, vendors: 0 };
    const vs = new Set(data.vulnerabilities.map((v) => v.vendor_project));
    return {
      total: data.total,
      ransomware: data.vulnerabilities.filter((v) => v.known_ransomware_campaign_use === 'Known').length,
      overdue: data.vulnerabilities.filter((v) => isOverdue(v.due_date)).length,
      vendors: vs.size,
    };
  }, [data]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(sorted, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cisa-kev-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const headers = [
      'cve_id',
      'vendor_project',
      'product',
      'vulnerability_name',
      'date_added',
      'due_date',
      'known_ransomware_campaign_use',
      'short_description',
    ];
    const rows = sorted.map((v) => headers.map((h) => `"${(v as any)[h]?.replace(/"/g, '""') ?? ''}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cisa-kev-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <button
      onClick={() => toggleSort(field)}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
    >
      {label}
      {sortKey === field && <span className="text-brand-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-1">
        <ShieldAlert className="w-7 h-7 text-rose-500" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">CISA KEV Catalog</h1>
      </div>
      <p className="text-muted mb-6 text-sm max-w-3xl leading-relaxed">
        Known Exploited Vulnerabilities — the official CISA catalog of vulnerabilities with confirmed active
        exploitation. Filter by vendor, product, ransomware use, and timeframe. Export to JSON or CSV.
      </p>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        {[
          { label: 'Total KEV', value: stats.total, icon: Hash, cls: 'text-slate-500' },
          { label: 'Ransomware', value: stats.ransomware, icon: Skull, cls: 'text-amber-600 dark:text-amber-400' },
          { label: 'Overdue', value: stats.overdue, icon: Flame, cls: 'text-rose-600 dark:text-rose-400' },
          { label: 'Vendors', value: stats.vendors, icon: ShieldAlert, cls: 'text-sky-600 dark:text-sky-400' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div
            key={label}
            className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a]/50 shadow-e1 p-2.5"
          >
            <div className={`flex items-center gap-1.5 text-mini uppercase tracking-wider mb-0.5 ${cls}`}>
              <Icon className="w-3 h-3" /> {label}
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-slate-100">{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search CVE, vendor, product, name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[#12121a] border border-slate-200 dark:border-[#1e2030] rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
          />
        </div>
        <input
          type="text"
          placeholder="Vendor filter…"
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="w-full sm:w-40 px-3 py-2 bg-white dark:bg-[#12121a] border border-slate-200 dark:border-[#1e2030] rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
        />
        <input
          type="text"
          placeholder="Product filter…"
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="w-full sm:w-40 px-3 py-2 bg-white dark:bg-[#12121a] border border-slate-200 dark:border-[#1e2030] rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
        />
        <select
          value={daysFilter}
          onChange={(e) => setDaysFilter(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-full sm:w-36 px-3 py-2 bg-white dark:bg-[#12121a] border border-slate-200 dark:border-[#1e2030] rounded-lg text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
        >
          <option value="">All time</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
          <option value={365}>Last year</option>
        </select>
        <button
          onClick={() => refetch()}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-[#1e2030] text-muted hover:border-slate-400 dark:hover:border-slate-600 text-sm flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Ransomware toggle + export */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setRansomwareOnly(!ransomwareOnly)}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition ${
            ransomwareOnly
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-slate-300 dark:border-[#1e2030] text-slate-500 hover:border-slate-400 dark:hover:border-slate-600'
          }`}
        >
          <Skull className="w-3.5 h-3.5" /> Ransomware only
        </button>
        <div className="flex-1" />
        <button
          onClick={exportJSON}
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#1e2030] text-muted hover:border-slate-400 dark:hover:border-slate-600 text-xs flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> JSON
        </button>
        <button
          onClick={exportCSV}
          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#1e2030] text-muted hover:border-slate-400 dark:hover:border-slate-600 text-xs flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {/* Results count */}
      {data && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-600 mb-3 font-mono">
          <span>
            {sorted.length} of {data.total} vulnerabilities
          </span>
          <span>
            catalog v{data.catalog_version} · updated {relativeAgo(data.timestamp)}
          </span>
        </div>
      )}

      {/* Table */}
      <DataState loading={loading} error={error} empty={sorted.length === 0} onRetry={refetch} rows={8}>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1e2030]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#12121a]/80 border-b border-slate-200 dark:border-[#1e2030]">
                <th className="px-3 py-2.5 text-left">
                  <SortHeader label="CVE" field="cve_id" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortHeader label="Vendor" field="vendor_project" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortHeader label="Product" field="product" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortHeader label="Added" field="date_added" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortHeader label="Due" field="due_date" />
                </th>
                <th className="px-3 py-2.5 text-left">Ransom</th>
                <th className="px-3 py-2.5 text-left">Name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {paged.map((v) => {
                const due = daysUntil(v.due_date);
                const overdue = due < 0;
                const dueSoon = due >= 0 && due <= 14;
                return (
                  <tr
                    key={v.cve_id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-900/40 transition ${overdue ? 'bg-rose-50/50 dark:bg-rose-900/10' : ''}`}
                  >
                    <td className="px-3 py-2 font-mono">
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${v.cve_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                      >
                        {v.cve_id} <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{v.vendor_project}</td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{v.product}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 font-mono text-xs">{v.date_added}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <span
                        className={
                          overdue
                            ? 'text-rose-600 dark:text-rose-400 font-semibold'
                            : dueSoon
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-500 dark:text-slate-400'
                        }
                      >
                        {v.due_date}
                        {overdue && <span className="ml-1 text-rose-500">(overdue)</span>}
                        {dueSoon && !overdue && <span className="ml-1 text-amber-500">({due}d)</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {v.known_ransomware_campaign_use === 'Known' ? (
                        <span className="px-1.5 py-0.5 text-micro font-mono rounded border border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center gap-1 leading-none w-fit">
                          <Skull className="w-2.5 h-2.5" /> Yes
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted text-xs max-w-xs truncate">{v.vulnerability_name}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DataState>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#1e2030] text-sm disabled:opacity-30 hover:border-slate-400 dark:hover:border-slate-600"
          >
            Prev
          </button>
          <span className="text-xs text-slate-500 font-mono">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-[#1e2030] text-sm disabled:opacity-30 hover:border-slate-400 dark:hover:border-slate-600"
          >
            Next
          </button>
        </div>
      )}

      {/* Vendor breakdown */}
      {vendors.length > 0 && (
        <div className="mt-8 rounded-xl border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a]/50 p-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">Top Vendors</h3>
          <div className="space-y-1.5">
            {vendors.slice(0, 15).map(([vendor, count]) => (
              <button
                key={vendor}
                onClick={() => setVendorFilter(vendor === vendorFilter ? '' : vendor)}
                className={`w-full flex items-center gap-2 text-xs px-2 py-1 rounded transition ${
                  vendorFilter === vendor
                    ? 'bg-brand-500/10 border border-brand-500/30 text-brand-700 dark:text-brand-300'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-muted'
                }`}
              >
                <span className="font-mono truncate flex-1 text-left">{vendor}</span>
                <span className="font-mono text-slate-400 dark:text-slate-600">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {data && (
        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#1e2030] text-xs text-slate-500 dark:text-slate-600 font-mono">
          Source: CISA KEV ·{' '}
          <a
            href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            cisa.gov
          </a>{' '}
          · {data.catalog_version}
        </div>
      )}
    </div>
  );
}
