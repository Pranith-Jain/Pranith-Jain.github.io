import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, Search, Download, ExternalLink, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
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
  cvss_score: number | null;
  severity: string | null;
}

interface KevResponse {
  total: number;
  vulnerabilities: KevEntry[];
  catalog_version: string;
  date_released: string;
  severity_stats: Record<string, number>;
  timestamp: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  Critical: 'bg-red-500 text-white',
  High: 'bg-orange-500 text-white',
  Medium: 'bg-amber-500 text-white',
  Low: 'bg-emerald-500 text-white',
  '(none)': 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-300',
};

const SEVERITY_PILL: Record<string, string> = {
  Critical: 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  High: 'border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  Medium: 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  Low: 'border-emerald-300 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  '(none)':
    'border-slate-300 dark:border-[rgb(var(--border-500))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] text-slate-500 dark:text-slate-400',
};

const SEV_ORDER = ['Critical', 'High', 'Medium', 'Low'];

function downloadCsv(entries: KevEntry[]) {
  const header =
    'cve_id,severity,cvss_score,vendor_project,product,vulnerability_name,date_added,due_date,known_ransomware\n';
  const rows = entries.map((e) =>
    [
      e.cve_id,
      e.severity ?? '',
      e.cvss_score?.toString() ?? '',
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

function SeverityBar({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const bars = SEV_ORDER.map((s) => ({ sev: s, count: counts[s] ?? 0 }))
    .filter((b) => b.count > 0)
    .map((b) => ({ ...b, pct: (b.count / total) * 100 }));
  return (
    <div className="space-y-1">
      <div className="flex h-5 rounded-full overflow-hidden border border-slate-200 dark:border-[rgb(var(--border-400))]">
        {bars.map((b) => (
          <div
            key={b.sev}
            style={{ width: `${b.pct}%` }}
            className={`${(SEVERITY_COLORS[b.sev] || 'bg-slate-300').split(' ')[0]} flex items-center justify-center text-[10px] font-bold text-white transition-all`}
            title={`${b.sev}: ${b.count.toLocaleString()} (${b.pct.toFixed(1)}%)`}
          >
            {b.pct > 8 ? b.count.toLocaleString() : ''}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        {bars.map((b) => (
          <span key={b.sev} className="flex items-center gap-1">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${(SEVERITY_COLORS[b.sev] || 'bg-slate-300').split(' ')[0]}`}
            />
            {b.sev} <strong>{b.count.toLocaleString()}</strong> ({b.pct.toFixed(1)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string | null }) {
  const s = severity || '(none)';
  const cls = SEVERITY_PILL[s] || SEVERITY_PILL['(none)'];
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{s}</span>;
}

const PAGE_SIZES = [25, 50, 100];

export default function CisaKevCatalog({ bare = false }: { bare?: boolean } = {}): JSX.Element {
  const [data, setData] = useState<KevResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [ransomwareOnly, setRansomwareOnly] = useState(false);
  const [daysFilter, setDaysFilter] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [sortCol, setSortCol] = useState<'date_added' | 'cve_id' | 'vendor_project' | 'severity'>('date_added');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchJson<KevResponse>('/api/v1/cisa-kev', { signal });
      setData(r);
    } catch (e) {
      console.error('CisaKevCatalog failed:', e instanceof Error ? e.message : String(e));
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

  useEffect(() => {
    setPage(0);
  }, [query, vendorFilter, ransomwareOnly, daysFilter, severityFilter]);

  const filtered = useMemo(() => {
    let list = data?.vulnerabilities ?? [];
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (v) =>
          v.cve_id.toLowerCase().includes(q) ||
          v.vulnerability_name.toLowerCase().includes(q) ||
          v.product.toLowerCase().includes(q) ||
          v.vendor_project.toLowerCase().includes(q)
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
    if (severityFilter) {
      list = list.filter((v) => v.severity === severityFilter);
    }
    list = [...list].sort((a, b) => {
      const av = a[sortCol] ?? '';
      const bv = b[sortCol] ?? '';
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [data, query, vendorFilter, ransomwareOnly, daysFilter, severityFilter, sortCol, sortAsc]);

  const pageCount = Math.ceil(filtered.length / pageSize);

  const pageEntries = useMemo(() => {
    const start = page * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

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

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of filtered) {
      const s = v.severity || '(none)';
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [filtered]);

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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-900 dark:text-slate-100' },
          { label: 'Ransomware', value: stats.ransomware, color: 'text-red-600 dark:text-red-400' },
          { label: 'Last 30d', value: stats.last30, color: 'text-amber-600 dark:text-amber-400' },
          {
            label: 'With CVSS',
            value: filtered.filter((v) => v.cvss_score != null).length,
            color: 'text-blue-600 dark:text-blue-400',
          },
          { label: 'Showing', value: filtered.length, color: 'text-brand-600 dark:text-brand-400' },
        ].map((kpi) => (
          <div key={kpi.label} className="surface-card p-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</div>
            <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Severity distribution bar */}
      {filtered.length > 0 && (
        <div className="surface-card p-3">
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-2">Severity Distribution</div>
          <SeverityBar counts={severityCounts} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search CVE, product, name..."
            className="w-full pl-8 pr-3 py-2 text-sm surface-card text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          />
        </div>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="text-sm surface-card text-slate-900 dark:text-slate-100 px-3 py-2"
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
          className="text-sm surface-card text-slate-900 dark:text-slate-100 px-3 py-2"
        >
          <option value="">All time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="text-sm surface-card text-slate-900 dark:text-slate-100 px-3 py-2"
        >
          <option value="">All severity</option>
          {SEV_ORDER.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={ransomwareOnly}
            onChange={(e) => setRansomwareOnly(e.target.checked)}
            className="rounded border-slate-300 dark:border-[rgb(var(--border-500))]"
          />
          <AlertTriangle size={12} className="text-red-500" /> Ransomware only
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))]/50">
              {[
                { key: 'date_added' as const, label: 'Added' },
                { key: 'cve_id' as const, label: 'CVE ID' },
                { key: 'severity' as const, label: 'Severity' },
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
            {pageEntries.map((v) => {
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
                  <td className="px-3 py-2">
                    <SeverityBadge severity={v.severity} />
                    {v.cvss_score != null && (
                      <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {v.cvss_score.toFixed(1)}
                      </span>
                    )}
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

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))] text-xs text-slate-500 dark:text-slate-400">
            <span>
              {filtered.length.toLocaleString()} result{filtered.length !== 1 ? 's' : ''}
              {pageSize < filtered.length && ` — page ${page + 1} of ${pageCount} (${pageEntries.length} shown)`}
            </span>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline">Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                className="text-xs rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] text-slate-700 dark:text-slate-300 px-2 py-1"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value={filtered.length}>All</option>
              </select>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage(Math.max(0, page - 1))}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="min-w-[4ch] text-center text-slate-600 dark:text-slate-300">
                  {page + 1}/{pageCount}
                </span>
                <button
                  type="button"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
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
