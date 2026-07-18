import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Hash, RefreshCw, Search, Shield, AlertTriangle, Calendar } from 'lucide-react';
import { useDataFetch } from '../../hooks/useDataFetch';
import { DataState } from '../../components/DataState';

interface CertInAdvisory {
  id: string;
  published_at: string;
  severity: string;
  cves: string[];
  products_affected: string[];
  description: string;
  detail_url: string;
  summary: string;
  indexed_at: string;
}

interface CertInResponse {
  total: number;
  advisories: CertInAdvisory[];
  generated_at: string;
  source: string;
  query?: {
    q?: string;
    cve?: string;
    year?: string;
    severity?: string;
    id?: string;
    limit?: number;
  };
}

type SortKey = 'published_at' | 'severity' | 'id' | 'cve_count';
type SortDir = 'asc' | 'desc';

const SEVERITY_ORDER: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 };

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  high: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  low: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  unknown:
    'border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-100 dark:bg-[rgb(var(--surface-300)/0.4)] text-slate-500',
};

function formatDate(iso: string): string {
  if (!iso) return '—';
  // Avoid timezone drift: the index stores YYYY-MM-DD directly.
  return iso;
}

export default function CertInAdvisories({ bare = false }: { bare?: boolean } = {}): JSX.Element {
  const [query, setQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('published_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (yearFilter) params.set('year', yearFilter);
  if (severityFilter) params.set('severity', severityFilter);
  const qs = params.toString();

  const { data, loading, error, refetch } = useDataFetch<CertInResponse>({
    url: `/api/v1/cert-in${qs ? `?${qs}` : ''}`,
    ttl: 300_000,
    staleWhileRevalidate: true,
  });

  useEffect(() => {
    /* state is already triggering refetch via url change */
  }, [qs]);

  const sorted = useMemo(() => {
    if (!data) return [];
    const items = [...data.advisories];
    items.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'published_at') cmp = (a.published_at || '').localeCompare(b.published_at || '');
      else if (sortKey === 'severity') cmp = (SEVERITY_ORDER[a.severity] ?? 0) - (SEVERITY_ORDER[b.severity] ?? 0);
      else if (sortKey === 'id') cmp = a.id.localeCompare(b.id);
      else if (sortKey === 'cve_count') cmp = a.cves.length - b.cves.length;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return items;
  }, [data, sortKey, sortDir]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, critical: 0, high: 0, years: 0, withCve: 0 };
    return {
      total: data.total,
      critical: data.advisories.filter((a) => a.severity === 'critical').length,
      high: data.advisories.filter((a) => a.severity === 'high').length,
      withCve: data.advisories.filter((a) => a.cves.length > 0).length,
      years: new Set(data.advisories.map((a) => a.id.split('-')[1])).size,
    };
  }, [data]);

  const years = useMemo(() => {
    if (!data) return [] as string[];
    return [...new Set(data.advisories.map((a) => a.id.split('-')[1]))]
      .filter((y) => /^\d{4}$/.test(y!))
      .sort()
      .reverse();
  }, [data]);

  function exportJSON(): void {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data.advisories, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cert-in-advisories-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCSV(): void {
    if (!data) return;
    const headers = ['id', 'published_at', 'severity', 'cves', 'products_affected', 'summary', 'detail_url'];
    const escape = (s: string): string => `"${(s || '').replace(/"/g, '""')}"`;
    const lines = [headers.join(',')];
    for (const adv of data.advisories) {
      lines.push(
        [
          escape(adv.id),
          escape(adv.published_at),
          escape(adv.severity),
          escape(adv.cves.join('; ')),
          escape(adv.products_affected.join('; ')),
          escape(adv.summary),
          escape(adv.detail_url),
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cert-in-advisories-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function SortHeader({ label, field }: { label: string; field: SortKey }): JSX.Element {
    const active = sortKey === field;
    return (
      <button
        type="button"
        onClick={() => {
          if (active) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
          else {
            setSortKey(field);
            setSortDir('desc');
          }
        }}
        className={`flex items-center gap-1 font-mono text-xs uppercase tracking-wider ${
          active
            ? 'text-brand-600 dark:text-brand-400'
            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
        }`}
      >
        {label}
        {active && <span aria-hidden>{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    );
  }

  return (
    <div>
      {/* Header is redundant when embedded as a CveIntel tab (the parent
          DataPageLayout already titles the panel), so drop it when bare. */}
      {!bare && (
        <>
          <div className="flex items-center gap-3 mb-1">
            <Shield className="w-7 h-7 text-sky-500" />
            <h1 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 dark:text-slate-100">
              CERT-In Advisories
            </h1>
          </div>
          <p className="text-muted mb-6 text-sm max-w-3xl leading-relaxed">
            Advisories published by the Indian Computer Emergency Response Team (CERT-In) — vulnerability disclosures
            affecting Indian enterprises and critical infrastructure. Filter by year or severity, or search by CVE /
            product. Click any advisory ID to open the official detail page.
          </p>
        </>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
        {[
          { label: 'Advisories', value: stats.total, icon: Hash, cls: 'text-slate-500' },
          { label: 'Critical', value: stats.critical, icon: AlertTriangle, cls: 'text-rose-600 dark:text-rose-400' },
          { label: 'High', value: stats.high, icon: AlertTriangle, cls: 'text-orange-600 dark:text-orange-400' },
          { label: 'With CVE', value: stats.withCve, icon: Hash, cls: 'text-sky-600 dark:text-sky-400' },
          { label: 'Years', value: stats.years, icon: Calendar, cls: 'text-violet-600 dark:text-violet-400' },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="surface-card/50 shadow-e1 p-2.5">
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
            placeholder="Search CVE, product, ID, description…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
          />
        </div>
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="w-full sm:w-32 px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
        >
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="w-full sm:w-36 px-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500"
        >
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button
          onClick={() => refetch()}
          className="px-3 py-2 rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-slate-400 dark:hover:border-slate-600 text-sm flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Export row */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1" />
        <button
          onClick={exportJSON}
          disabled={!data}
          className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-slate-400 dark:hover:border-slate-600 text-xs flex items-center gap-1.5 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" /> JSON
        </button>
        <button
          onClick={exportCSV}
          disabled={!data}
          className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-slate-400 dark:hover:border-slate-600 text-xs flex items-center gap-1.5 disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {/* Count */}
      {data && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-3 font-mono">
          <span>
            {sorted.length} of {data.total} advisories
          </span>
          <a
            href="https://www.cert-in.org.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1"
          >
            Source: cert-in.org.in <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Table */}
      <DataState loading={loading} error={error} empty={sorted.length === 0} onRetry={refetch} rows={6}>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-[rgb(var(--surface-200))]/80 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                <th className="px-3 py-2.5 text-left">
                  <SortHeader label="Advisory ID" field="id" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortHeader label="Published" field="published_at" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortHeader label="Severity" field="severity" />
                </th>
                <th className="px-3 py-2.5 text-left">
                  <SortHeader label="CVEs" field="cve_count" />
                </th>
                <th className="px-3 py-2.5 text-left">Products</th>
                <th className="px-3 py-2.5 text-left">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {sorted.map((adv) => (
                <tr key={adv.id} className="hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-200)/0.4)] transition">
                  <td className="px-3 py-2 font-mono whitespace-nowrap">
                    <a
                      href={adv.detail_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                    >
                      {adv.id} <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap text-slate-600 dark:text-slate-400">
                    {formatDate(adv.published_at)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded border text-xs font-mono uppercase tracking-wider ${
                        SEVERITY_STYLES[adv.severity] || SEVERITY_STYLES.unknown
                      }`}
                    >
                      {adv.severity}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {adv.cves.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {adv.cves.slice(0, 3).map((cve) => (
                          <a
                            key={cve}
                            href={`https://nvd.nist.gov/vuln/detail/${cve}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            {cve}
                          </a>
                        ))}
                        {adv.cves.length > 3 && <span className="text-xs text-slate-500">+{adv.cves.length - 3}</span>}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-xs">
                    {adv.products_affected.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {adv.products_affected.slice(0, 2).map((p, i) => (
                          <span
                            key={i}
                            className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300)/0.6)] text-slate-600 dark:text-slate-400"
                          >
                            {p.length > 32 ? `${p.slice(0, 32)}…` : p}
                          </span>
                        ))}
                        {adv.products_affected.length > 2 && (
                          <span className="text-xs text-slate-500">+{adv.products_affected.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400 text-xs max-w-md">
                    {adv.description ? (
                      <span className="line-clamp-2">{adv.description}</span>
                    ) : (
                      <span className="italic text-slate-400">{adv.summary}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
    </div>
  );
}
