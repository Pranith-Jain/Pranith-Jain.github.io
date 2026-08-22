import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable';
import { AlertTriangle, Filter, Rss, Search, Shield } from 'lucide-react';
import { IOC_FEEDS, type IocFeed } from '../../data/threatintel/ioc-feeds-data';

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
const SEV_COLORS: Record<string, string> = {
  critical: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50',
  high: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50',
  medium:
    'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50',
  low: 'text-brand-600 dark:text-brand-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50',
};

export default function IocFeedsPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [activeSev, setActiveSev] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = IOC_FEEDS;
    if (activeSev) list = list.filter((f) => f.severity === activeSev);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((f) => f.title.toLowerCase().includes(q) || f.tags.some((t) => t.toLowerCase().includes(q)));
    }
    return list;
  }, [query, activeSev]);

  const totalIocs = IOC_FEEDS.reduce((s, f) => s + f.iocCount, 0);

  const sevCounts = useMemo(() => {
    const c: Record<string, number> = {};
    IOC_FEEDS.forEach((f) => {
      c[f.severity] = (c[f.severity] || 0) + 1;
    });
    return c;
  }, []);

  const copyUrl = (feed: IocFeed) => {
    navigator.clipboard.writeText(feed.downloadUrl).then(() => {
      setCopiedId(feed.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Rss size={28} />}
      title="IOC Feeds"
      maxWidthClass="max-w-5xl"
      description={
        <>
          Structured indicator feeds ready for SIEM, EDR, or CTI platform ingestion. {IOC_FEEDS.length} feeds ·{' '}
          {totalIocs.toLocaleString()} IOCs. Curated from{' '}
          <a
            href="https://the-hunters-ledger.com/ioc-feeds/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-rose-600 dark:text-rose-400 hover:underline transition-colors"
          >
            The Hunter's Ledger
          </a>{' '}
          (CC BY-NC 4.0).
        </>
      }
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search feeds, tags…"
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl font-mono text-sm focus:outline-none focus:border-rose-500 dark:focus:border-rose-400"
          />
        </div>
        <span className="text-xs font-mono text-muted">{filtered.length} feeds</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        <button
          type="button"
          onClick={() => setActiveSev(null)}
          className={`text-xs font-mono px-3 py-1.5 rounded-xl border transition-colors ${
            !activeSev
              ? 'border-rose-500/60 bg-rose-500/15 text-rose-700 dark:text-rose-300'
              : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-slate-300 dark:hover:border-[rgb(var(--border-400))]'
          }`}
        >
          All ({IOC_FEEDS.length})
        </button>
        {SEVERITIES.map((sev) => (
          <button
            type="button"
            key={sev}
            onClick={() => setActiveSev(activeSev === sev ? null : sev)}
            className={`text-xs font-mono px-3 py-1.5 rounded-xl border transition-colors ${
              activeSev === sev
                ? 'border-rose-500/60 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-slate-300 dark:hover:border-[rgb(var(--border-400))]'
            }`}
          >
            {sev.toUpperCase()} ({sevCounts[sev] || 0})
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] overflow-hidden">
        <div className="overflow-x-auto">
          <DataTable
            columns={
              [
                {
                  key: 'severity',
                  header: 'Severity',
                  sortValue: (feed: IocFeed) => feed.severity,
                  render: (feed) => (
                    <span
                      className={`inline-flex items-center gap-1 text-micro font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${SEV_COLORS[feed.severity]}`}
                    >
                      {feed.severity === 'critical' && <AlertTriangle size={9} />}
                      {feed.severity === 'high' && <Shield size={9} />}
                      {feed.severity}
                    </span>
                  ),
                },
                {
                  key: 'feed',
                  header: 'Feed',
                  sortValue: (feed: IocFeed) => feed.title,
                  render: (feed) => (
                    <span>
                      <span className="text-heading">{feed.title}</span>
                      <span className="text-slate-500 ml-2">· {feed.date}</span>
                    </span>
                  ),
                },
                {
                  key: 'tags',
                  header: 'Tags',
                  render: (feed) => (
                    <div className="flex flex-wrap gap-1">
                      {feed.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-micro px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ),
                },
                {
                  key: 'iocCount',
                  header: 'IOCs',
                  align: 'right',
                  sortValue: (feed: IocFeed) => feed.iocCount,
                  render: (feed) => <span className="text-body">{feed.iocCount}</span>,
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  align: 'right',
                  render: (feed) => (
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => copyUrl(feed)}
                        className="inline-flex items-center gap-1 text-micro px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-rose-500/50 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                      >
                        {copiedId === feed.id ? 'copied' : <Filter size={9} />}
                      </button>
                    </div>
                  ),
                },
              ] as DataTableColumn<IocFeed>[]
            }
            rows={filtered}
            rowKey={(feed) => feed.id}
            rowClassName={() => 'hover:bg-slate-50 dark:hover:bg-[rgb(var(--input-200)/0.5)]'}
          />
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm font-mono text-slate-500">No feeds match your search.</div>
      )}
    </DataPageLayout>
  );
}
