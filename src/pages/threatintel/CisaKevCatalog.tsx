import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, Search, Download, ExternalLink, AlertTriangle } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { fetchJson } from '../../lib/fetch-helpers';

interface KevEntry {
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
  vulnerabilities: KevEntry[];
  catalog_version: string;
  date_released: string;
  timestamp: string;
}

function downloadCsv(entries: KevEntry[]) {
  const header = 'cve_id,vendor_project,product,vulnerability_name,date_added,due_date,known_ransomware\n';
  const rows = entries.map((e) =>
    [
      e.cve_id,
      e.vendor_project,
      e.product,
      e.vulnerability_name,
      e.date_added,
      e.due_date,
      e.known_ransomware_campaign_use,
    ]
      .map((f) => `"${(f ?? '').replace(/"/g, '""')}"`)
      .join(',')
  );
  const blob = new Blob([header + rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cisa-kev-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CisaKevCatalog({ bare = false }: { bare?: boolean } = {}): JSX.Element {
  const [data, setData] = useState<KevResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [ransomwareOnly, setRansomwareOnly] = useState(false);
  const [daysFilter, setDaysFilter] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<'date_added' | 'cve_id' | 'vendor_project'>('date_added');
  const [sortAsc, setSortAsc] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchJson<KevResponse>('/api/v1/cisa-kev', { signal });
      setData(r);
    } catch (e) {
      if ((e as { name?: string }).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : 'Failed to load KEV catalog.');
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

  const filtered = useMemo(() => {
    let list = data?.vulnerabilities ?? [];
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (v) =>
          v.cve_id.toLowerCase().includes(q) ||
          v.vulnerability_name.toLowerCase().includes(q) ||
          v.product.toLowerCase().includes(q)
      );
    }
    if (vendorFilter.trim()) {
      const vf = vendorFilter.toLowerCase();
      list = list.filter((v) => v.vendor_project.toLowerCase().includes(vf));
    }
    if (ransomwareOnly) {
      list = list.filter((v) => v.known_ransomware_campaign_use === 'Known');
    }
    if (daysFilter) {
      const cutoff = new Date(Date.now() - daysFilter * 86_400_000).toISOString().slice(0, 10);
      list = list.filter((v) => v.date_added >= cutoff);
    }
    list = [...list].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return list;
  }, [data, query, vendorFilter, ransomwareOnly, daysFilter, sortCol, sortAsc]);

  const vendors = useMemo(() => {
    const s = new Set<string>();
    (data?.vulnerabilities ?? []).forEach((v) => s.add(v.vendor_project));
    return [...s].sort();
  }, [data]);

  const stats = useMemo(() => {
    const all = data?.vulnerabilities ?? [];
    const ransomware = all.filter((v) => v.known_ransomware_campaign_use === 'Known').length;
    const last30 = all.filter(
      (v) => v.date_added >= new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    ).length;
    return { total: all.length, ransomware, last30 };
  }, [data]);

  const toggleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const sortIcon = (col: typeof sortCol) => (sortCol === col ? (sortAsc ? ' \u2191' : ' \u2193') : '');

  const body = (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-900 dark:text-slate-100' },
          { label: 'Ransomware', value: stats.ransomware, color: 'text-red-600 dark:text-red-400' },
          { label: 'Last 30d', value: stats.last30, color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Showing', value: filtered.length, color: 'text-brand-600 dark:text-brand-400' },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</div>
            <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search CVE, product, name..."
            className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          />
        </div>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2"
        >
          <option value="">All vendors</option>
          {vendors.slice(0, 100).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={daysFilter ?? ''}
          onChange={(e) => setDaysFilter(e.target.value ? Number(e.target.value) : null)}
          className="text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-3 py-2"
        >
          <option value="">All time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={ransomwareOnly}
            onChange={(e) => setRansomwareOnly(e.target.checked)}
            className="rounded border-slate-300 dark:border-slate-600"
          />
          <AlertTriangle size={12} className="text-red-500" /> Ransomware only
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              {[
                { key: 'date_added' as const, label: 'Added' },
                { key: 'cve_id' as const, label: 'CVE ID' },
                { key: 'vendor_project' as const, label: 'Vendor' },
                { label: 'Product' },
                { label: 'Vulnerability' },
                { label: 'Due' },
                { label: 'Ransomware' },
              ].map((col, i) => (
                <th
                  key={i}
                  className={`px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300 ${col.key ? 'cursor-pointer hover:text-slate-900 dark:hover:text-white' : ''}`}
                  onClick={col.key ? () => toggleSort(col.key!) : undefined}
                >
                  {col.label}
                  {col.key ? sortIcon(col.key) : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((v) => {
              const overdue = v.due_date && new Date(v.due_date) < new Date();
              return (
                <tr
                  key={v.cve_id}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{v.date_added}</td>
                  <td className="px-3 py-2">
                    <a
                      href={`https://nvd.nist.gov/vuln/detail/${v.cve_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 dark:text-brand-400 hover:underline font-mono text-xs"
                    >
                      {v.cve_id}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{v.vendor_project}</td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{v.product}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                    {v.vulnerability_name}
                  </td>
                  <td
                    className={`px-3 py-2 whitespace-nowrap ${overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    {v.due_date}
                  </td>
                  <td className="px-3 py-2">
                    {v.known_ransomware_campaign_use === 'Known' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                        <AlertTriangle size={10} /> Yes
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">No</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > 200 && (
          <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
            Showing 200 of {filtered.length.toLocaleString()} results. Export CSV for full data.
          </div>
        )}
      </div>
    </div>
  );
  if (bare) return body;
  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Shield size={28} />}
      title="CISA KEV Catalog"
      maxWidthClass="max-w-6xl"
      description={
        <>
          Known Exploited Vulnerabilities catalog — {stats.total.toLocaleString()} entries, {stats.ransomware} with
          ransomware use, {stats.last30} added in last 30 days.{' '}
          <a
            href="https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            cisa.gov <ExternalLink size={11} className="inline" />
          </a>
        </>
      }
      headerExtra={
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => downloadCsv(filtered)}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/70 transition-colors"
          >
            <Download size={12} /> Export CSV ({filtered.length})
          </button>
        </div>
      }
      loading={loading}
      error={error}
      onRetry={() => void load()}
      empty={filtered.length === 0 && !loading}
      emptyMessage="No KEV entries match your filters."
    >
      {body}
    </DataPageLayout>
  );
}
