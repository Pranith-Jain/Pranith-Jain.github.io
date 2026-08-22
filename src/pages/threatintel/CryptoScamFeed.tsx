import { useEffect, useMemo, useState } from 'react';
import { Bitcoin, Copy, Check, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { DataState } from '../../components/DataState';
import { fetchJsonCached } from '../../lib/api-client';
import { memoryCache } from '../../infrastructure/cache/memory-cache';
import { relativeAgo as shortRel } from '../../lib/relativeTime';
import { AiSummaryCard } from '../../components/intel/AiSummaryCard';
import { PostAnalysisButton } from '../../components/threatintel/PostAnalysisButton';
import { usePostSummaries } from '../../components/intel/usePostSummaries';
import { PostSummary } from '../../components/intel/PostSummary';

interface CryptoScamItem {
  domain: string;
  tld: string;
}

interface CryptoScamResponse {
  generated_at: string;
  stale: boolean;
  total: number;
  tld_breakdown: Record<string, number>;
  metadata: { title?: string; description?: string; author?: string; source?: string };
  items: CryptoScamItem[];
}

export default function CryptoScamFeed(): JSX.Element {
  const [data, setData] = useState<CryptoScamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tldFilter, setTldFilter] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [visible, setVisible] = useState(100);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Manual refresh must bypass the 60s client cache.
    if (refreshKey > 0) memoryCache.delete('/api/v1/crypto-scam-feed');
    fetchJsonCached<CryptoScamResponse>('/api/v1/crypto-scam-feed', 60_000)
      .then((d) => {
        setData(d);
      })
      .catch((e: Error) => {
        setError(e.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [refreshKey]);

  const topTlds = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.tld_breakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [data]);

  const maxTld = topTlds.length > 0 ? topTlds[0]![1] : 1;

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.items.filter((it) => {
      if (tldFilter && it.tld !== tldFilter) return false;
      if (!q) return true;
      return it.domain.includes(q);
    });
  }, [data, query, tldFilter]);

  const postSummaries = usePostSummaries({
    surface: 'Crypto Scam Domains',
    items: filtered.map((it) => ({
      id: String(it.domain),
      title: it.domain,
      body: `TLD: ${it.tld}`,
      source: 'crypto-scam-feed',
    })),
  });

  useEffect(() => {
    setVisible(100);
  }, [query, tldFilter, data]);

  const copyBlocklist = () => {
    const text = filtered.map((it) => it.domain).join('\n');
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <DataPageLayout
      title="Crypto scam feed"
      icon={<Bitcoin size={28} />}
      backTo="/threatintel"
      description="Fresh crypto-phishing, scam, drainer, and pig-butchering domains - all ≤ 1 year old at inclusion, refreshed daily."
      loading={loading}
      error={error}
    >
      <p className="text-sm text-muted mb-2">
        Sourced from{' '}
        <a
          href="https://github.com/spmedia/Crypto-Scam-and-Crypto-Phishing-Threat-Intel-Feed"
          target="_blank"
          rel="noopener noreferrer"
          className="text-rose-600 dark:text-rose-400 hover:underline transition-colors"
        >
          spmedia/Crypto-Scam-and-Crypto-Phishing-Threat-Intel-Feed
        </a>{' '}
        (MIT). Also flows into the{' '}
        <Link to="/threatintel/catalog?cat=iocs" className="text-rose-600 dark:text-rose-400 hover:underline">
          Live IOCs
        </Link>{' '}
        firehose.
      </p>
      {data && (
        <p className="text-xs text-muted font-mono mb-6">
          {data.total} domains · snapshot{' '}
          <span className="text-slate-700 dark:text-slate-300">{shortRel(data.generated_at)}</span>
          {data.stale && (
            <span className="text-amber-600 dark:text-amber-400 ml-2">· serving last-good (upstream unreachable)</span>
          )}
        </p>
      )}

      {topTlds.length > 0 && (
        <section className="surface-card p-4 mb-6">
          <h2 className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-3">TLD breakdown</h2>
          <div className="space-y-1.5">
            {topTlds.map(([tld, count]) => {
              const active = tldFilter === tld;
              return (
                <button
                  key={tld}
                  type="button"
                  onClick={() => setTldFilter(active ? null : tld)}
                  className="w-full flex items-center gap-3 group"
                  title={`${count} domains · click to filter`}
                >
                  <span
                    className={`w-16 text-right text-meta font-mono shrink-0 ${active ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-slate-500'}`}
                  >
                    .{tld}
                  </span>
                  <span className="flex-1 h-4 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] overflow-hidden">
                    <span
                      className={`block h-full rounded ${active ? 'bg-rose-500' : 'bg-rose-500/50 group-hover:bg-rose-500/70'}`}
                      style={{ width: `${Math.max(4, (count / maxTld) * 100)}%` }}
                    />
                  </span>
                  <span className="w-12 text-meta font-mono text-slate-500 shrink-0">{count}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="surface-card p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter domains…"
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm focus:outline-none focus:border-rose-500 dark:focus:border-rose-400"
              aria-label="Filter crypto scam domains"
            />
          </div>
          <button
            type="button"
            onClick={copyBlocklist}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 disabled:opacity-50 transition-colors"
            title="Copy filtered domains as a newline-separated blocklist"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'copied' : 'copy blocklist'}
          </button>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40"
          >
            <RefreshCw size={12} /> refresh
          </button>
        </div>
        {tldFilter && (
          <button
            type="button"
            onClick={() => setTldFilter(null)}
            className="text-mini font-mono text-rose-600 dark:text-rose-400 hover:underline mt-2"
          >
            clear .{tldFilter} filter
          </button>
        )}
      </section>

      {data && (
        <p className="text-mini font-mono text-slate-500 mb-4">
          Showing {filtered.length} of {data.total} domains
        </p>
      )}

      {filtered.length > 0 && (
        <>
          <PostAnalysisButton
            title="Crypto Scam Domains Digest"
            description="AI-powered threat analysis of the current feed."
            source="cryptoscamfeed"
          />
          <AiSummaryCard
            surface="Crypto Scam Domains"
            items={filtered.slice(0, 30).map((it) => ({
              title: it.domain,
              body: `TLD: ${it.tld}`,
              source: 'crypto-scam-feed',
            }))}
            requireAdmin={false}
          />
        </>
      )}

      <DataState
        loading={loading}
        error={error}
        empty={filtered.length === 0}
        emptyLabel={
          query || tldFilter ? 'No domains match the current filter.' : 'No domains in the upstream snapshot.'
        }
        onRetry={() => setRefreshKey((k) => k + 1)}
        rows={10}
      >
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {filtered.slice(0, visible).map((it) => (
            <li
              key={it.domain}
              className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] px-3 py-2 font-mono text-tool"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-slate-800 dark:text-slate-200">{it.domain}</span>
                <span className="text-mini text-muted shrink-0">.{it.tld}</span>
              </div>
              <PostSummary text={postSummaries.get(String(it.domain))} />
            </li>
          ))}
        </ul>
        {filtered.length > visible && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + 100)}
            className="mt-3 w-full rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] py-2 font-mono text-meta text-muted hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
          >
            Show more ({filtered.length - visible} remaining)
          </button>
        )}
      </DataState>
    </DataPageLayout>
  );
}
