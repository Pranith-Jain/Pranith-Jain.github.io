import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { AlertTriangle, Download, Filter, Rss, Search, Shield } from 'lucide-react';
import { IOC_FEEDS, type IocFeed } from '../../data/threatintel/ioc-feeds-data';
import { sanitizeUrl } from '../../lib/sanitize-url';

const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
const SEV_COLORS: Record<string, string> = {
  critical: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50',
  high: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50',
  medium:
    'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50',
  low: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/50',
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
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            The Hunter's Ledger
          </a>{' '}
          (CC BY-NC 4.0).
        </>
      }
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search feeds, tags…"
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
        </div>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{filtered.length} feeds</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        <button
          onClick={() => setActiveSev(null)}
          className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
            !activeSev
              ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
              : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-slate-300 dark:hover:border-[rgb(var(--border-400))]'
          }`}
        >
          All ({IOC_FEEDS.length})
        </button>
        {SEVERITIES.map((sev) => (
          <button
            key={sev}
            onClick={() => setActiveSev(activeSev === sev ? null : sev)}
            className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
              activeSev === sev
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-slate-300 dark:hover:border-[rgb(var(--border-400))]'
            }`}
          >
            {sev.toUpperCase()} ({sevCounts[sev] || 0})
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] overflow-hidden">
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]">
              <th className="px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider">Severity</th>
              <th className="px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider">Feed</th>
              <th className="px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider">Tags</th>
              <th className="px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider text-right">IOCs</th>
              <th className="px-4 py-3 text-slate-500 font-semibold uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((feed) => (
              <tr
                key={feed.id}
                className="border-b border-slate-100 dark:border-[rgb(var(--border-400))]/50 hover:bg-slate-50 dark:hover:bg-[rgb(var(--input-200)/0.5)] transition-colors"
              >
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${SEV_COLORS[feed.severity]}`}
                  >
                    {feed.severity === 'critical' && <AlertTriangle size={9} />}
                    {feed.severity === 'high' && <Shield size={9} />}
                    {feed.severity}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-900 dark:text-slate-100">{feed.title}</span>
                  <span className="text-slate-500 ml-2">· {feed.date}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {feed.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">{feed.iocCount}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => copyUrl(feed)}
                      className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                    >
                      {copiedId === feed.id ? '✓' : <Filter size={9} />}
                      {copiedId === feed.id ? 'Copied' : 'Copy URL'}
                    </button>
                    <a
                      href={sanitizeUrl(feed.downloadUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                    >
                      <Download size={9} /> Download
                    </a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm font-mono text-slate-500">No feeds match your search.</div>
      )}
    </DataPageLayout>
  );
}
