import { useEffect, useMemo, useState } from 'react';
import { FileText, Search, ExternalLink, RefreshCw } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface ReportEntry {
  slug: string;
  title: string;
  url: string;
  category: string;
  publisher: string;
  year: number;
  description: string;
  tags: string[];
}

interface ReportsPayload {
  count: number;
  reports: ReportEntry[];
}

const CATEGORY_LABELS: Record<string, string> = {
  'annual-threat-report': 'Annual Threat Report',
  framework: 'Framework',
  reference: 'Reference',
  learning: 'Learning',
};

export default function ReportsLibrary(): JSX.Element {
  const [data, setData] = useState<ReportsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState('');
  const [publisherFilter, setPublisherFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetch('/api/v1/reports', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((payload: ReportsPayload) => {
        if (!cancelled) setData(payload);
      })
      .catch((e) => {
        if (cancelled || e.name === 'AbortError') return;
        setError(e.message ?? 'fetch failed');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [refreshKey]);

  const categories = useMemo(() => {
    if (!data?.reports) return [];
    const s = new Set(data.reports.map((r) => r.category));
    return Array.from(s).sort();
  }, [data]);

  const publishers = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.reports.forEach((r) => set.add(r.publisher));
    return Array.from(set).sort();
  }, [data]);

  const yearsRange = useMemo(() => {
    if (!data || data.reports.length === 0) return '';
    const years = data.reports.map((r) => r.year);
    const min = Math.min(...years);
    const max = Math.max(...years);
    return min === max ? `${min}` : `${min}\u2013${max}`;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.reports;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.publisher.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (activeCategory) list = list.filter((r) => r.category === activeCategory);
    if (yearFilter.trim()) {
      const y = parseInt(yearFilter.trim(), 10);
      if (!Number.isNaN(y)) list = list.filter((r) => r.year === y);
    }
    if (publisherFilter.trim()) {
      list = list.filter((r) => r.publisher === publisherFilter.trim());
    }
    return list;
  }, [data, query, activeCategory, yearFilter, publisherFilter]);

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = {};
    if (data) data.reports.forEach((r) => { c[r.category] = (c[r.category] || 0) + 1; });
    return c;
  }, [data]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<FileText className="h-6 w-6" />}
      title="Reports & Reading Library"
      description="Curated collection of annual threat reports, security frameworks, standards, and learning resources referenced from the novasky.io CTI dashboard."
      headerExtra={
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 text-slate-500 dark:text-slate-400 hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> refresh
          </button>
        </div>
      }
      loading={loading}
      error={error}
      onRetry={() => setRefreshKey((k) => k + 1)}
      empty={!loading && !data}
      emptyMessage="No reports available."
      maxWidthClass="max-w-6xl"
    >
      {data && (
        <>
          <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 mb-4">
            <div className="flex flex-col gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${data.count} reports\u2026`}
                  className="w-full rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveCategory(null)}
                    className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-colors ${
                      !activeCategory
                        ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                        : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-[rgb(var(--border-400))]'
                    }`}
                  >
                    All ({data.count})
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                      className={`text-xs font-mono px-2.5 py-1 rounded-lg border transition-colors ${
                        activeCategory === cat
                          ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                          : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-[rgb(var(--border-400))]'
                      }`}
                    >
                      {CATEGORY_LABELS[cat] ?? cat} ({categoryCounts[cat] || 0})
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <input
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    placeholder="Year"
                    className="w-20 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] px-2 py-1 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none"
                  />
                  <select
                    value={publisherFilter}
                    onChange={(e) => setPublisherFilter(e.target.value)}
                    className="w-36 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] px-2 py-1 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-brand-500/60 focus:outline-none"
                  >
                    <option value="">All publishers</option>
                    {publishers.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Reports" value={data.count} />
            <Stat label="Years" value={yearsRange || '\u2014'} />
            <Stat label="Filtered" value={filtered.length} />
            <Stat label="Publishers" value={publishers.length} />
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              <Search className="mx-auto mb-2 h-8 w-8 text-slate-400 dark:text-slate-400" />
              {query || activeCategory || yearFilter || publisherFilter
                ? 'No reports match your filters.'
                : 'No reports available.'}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((report) => (
                <ReportCard key={report.slug} report={report} />
              ))}
            </div>
          )}
        </>
      )}
    </DataPageLayout>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 px-3 py-2">
      <div className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">{value}</div>
    </div>
  );
}

function ReportCard({ report }: { report: ReportEntry }) {
  return (
    <a
      href={report.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4 hover:border-brand-500/40 hover:shadow-e2 transition-all"
    >
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {CATEGORY_LABELS[report.category] ?? report.category}
        </span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--input-200))] text-slate-500 dark:text-slate-400">
          {report.year}
        </span>
      </div>

      <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 leading-snug mb-1 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
        {report.title}
      </h3>

      <p className="text-xs text-muted leading-relaxed mb-3 line-clamp-2">{report.description}</p>

      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-700 dark:text-brand-300">
          {report.publisher}
          <ExternalLink className="h-2.5 w-2.5" />
        </span>
      </div>

      {report.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-100 dark:border-[rgb(var(--border-400))]/60">
          {report.tags.map((tag) => (
            <span
              key={tag}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}
