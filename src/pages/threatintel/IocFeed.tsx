import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileText, Globe, Hash, Loader2, RefreshCw, Search, Tag } from 'lucide-react';

/**
 * Generic IOC feed page. Five surfaces share the same shape — each is a
 * filterable list of indicators with type, source, context, and timestamp:
 *
 *   /threatintel/urls            kind="url"
 *   /threatintel/domains         kind="domain"
 *   /threatintel/hashs           kind="hash"          (URL spelling per request)
 *   /threatintel/malicious-urls  kind="malicious-url" (URL bucket filtered to URLhaus)
 *   /threatintel/iocs-by-type    kind="all"           (all three buckets concatenated)
 *
 * All five pull from /api/v1/threat-map (cached 1h server-side) so they
 * share the same upstream snapshot — no duplicate fetching.
 *
 * Each card links to /dfir/ioc-check?indicator=<value> so an analyst can
 * one-click pivot from "saw it in the feed" to "run it through 24 sources".
 */

type Kind = 'url' | 'domain' | 'hash' | 'malicious-url' | 'all';

interface IocSample {
  value: string;
  source: string;
  context?: string;
  timestamp?: string;
}

interface IocTypeBucket {
  type: 'url' | 'domain' | 'hash';
  count: number;
  source_counts: Record<string, number>;
  recent: IocSample[];
}

interface ThreatMapResponse {
  generated_at: string;
  iocs_by_type: IocTypeBucket[];
}

interface PageMeta {
  title: string;
  intro: string;
  icon: typeof Globe;
  /** Rows from which type bucket(s) to show. */
  bucketTypes: Array<'url' | 'domain' | 'hash'>;
  /** Optional source filter (e.g. "urlhaus" for malicious-urls). */
  sourceFilter?: string;
}

const META: Record<Kind, PageMeta> = {
  url: {
    title: 'Live URLs',
    intro:
      'URLs aggregated from URLhaus and ThreatFox in the last hour. Each entry shows the source feed and any tag/context the upstream provided. Reference only — verify in your environment before blocking.',
    icon: Globe,
    bucketTypes: ['url'],
  },
  domain: {
    title: 'Live Domains',
    intro:
      'Malicious domains aggregated from ThreatFox in the last hour. Per-entry timestamp shows when the upstream first saw it. Reference only — verify before blocking.',
    icon: Globe,
    bucketTypes: ['domain'],
  },
  hash: {
    title: 'Live File Hashes',
    intro:
      'File hashes aggregated from MalwareBazaar and ThreatFox in the last hour. Per-entry timestamp shows when the upstream first saw the sample. Click any hash to run it through the IOC Checker (24 sources).',
    icon: Hash,
    bucketTypes: ['hash'],
  },
  'malicious-url': {
    title: 'Malicious URLs (URLhaus)',
    intro:
      'URLs flagged by URLhaus in the last hour. URLhaus focuses on malware-distribution / drive-by-download URLs (vs phishing — see /threatintel/phishing-urls for that side).',
    icon: Globe,
    bucketTypes: ['url'],
    sourceFilter: 'urlhaus',
  },
  all: {
    title: 'IOCs by type',
    intro:
      'Combined live feed of every IOC type currently aggregated from URLhaus, ThreatFox, and MalwareBazaar — URLs, domains, and file hashes side-by-side.',
    icon: Tag,
    bucketTypes: ['url', 'domain', 'hash'],
  },
};

function shortRel(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface IocFeedProps {
  kind: Kind;
}

export default function IocFeed({ kind }: IocFeedProps): JSX.Element {
  const meta = META[kind];
  const Icon = meta.icon;

  const [data, setData] = useState<ThreatMapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/v1/threat-map')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<ThreatMapResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const buckets = useMemo(() => {
    if (!data?.iocs_by_type) return [];
    return data.iocs_by_type
      .filter((b) => meta.bucketTypes.includes(b.type))
      .map((b) => {
        let recent = b.recent;
        if (meta.sourceFilter) recent = recent.filter((s) => s.source === meta.sourceFilter);
        if (query.trim()) {
          const q = query.toLowerCase();
          recent = recent.filter(
            (s) =>
              s.value.toLowerCase().includes(q) ||
              (s.context ?? '').toLowerCase().includes(q) ||
              s.source.toLowerCase().includes(q)
          );
        }
        return { ...b, recent };
      });
  }, [data, meta, query]);

  const totalShown = buckets.reduce((sum, b) => sum + b.recent.length, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Icon size={28} className="text-brand-600 dark:text-brand-400" /> {meta.title}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">{meta.intro}</p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          Source: <span className="text-slate-700 dark:text-slate-300">/api/v1/threat-map</span> · cached 1h server-side
          · click any indicator to pivot to{' '}
          <Link to="/dfir/ioc-check" className="text-brand-600 dark:text-brand-400 hover:underline">
            IOC Checker
          </Link>
          .
        </p>
      </div>

      {/* Search + refresh */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by value, source, or context…"
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            aria-label="Filter IOC list"
          />
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 text-xs font-mono px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
          title="Re-fetch /api/v1/threat-map (bypasses your browser cache; the worker still serves cached payload)"
        >
          <RefreshCw size={12} /> refresh
        </button>
      </section>

      {data && (
        <p className="text-[11px] font-mono text-slate-500 mb-4">
          {totalShown} item{totalShown === 1 ? '' : 's'}
          {query ? ` matching "${query}"` : ''} · upstream snapshot from{' '}
          <span className="text-slate-700 dark:text-slate-300">{shortRel(data.generated_at)}</span> (
          {new Date(data.generated_at).toISOString()})
        </p>
      )}

      {loading && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 flex items-center gap-3 font-mono text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> loading from /api/v1/threat-map…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 font-mono text-sm text-rose-600 dark:text-rose-300">
          Failed to load: {error}
        </div>
      )}

      {!loading && !error && totalShown === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-mono text-slate-500">
          {query ? `No items match "${query}".` : 'Upstream snapshot has no items in this bucket right now.'}
        </div>
      )}

      {buckets.map((b) => (
        <section key={b.type} className="mb-10">
          {meta.bucketTypes.length > 1 && (
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-display font-bold text-xl capitalize">
                {b.type === 'hash' ? 'File hashes' : `${b.type}s`}
              </h2>
              <span className="text-[11px] font-mono text-slate-500">
                {b.recent.length} of {b.count} unique ·{' '}
                {Object.entries(b.source_counts)
                  .map(([k, n]) => `${k} ${n}`)
                  .join(' · ')}
              </span>
            </div>
          )}
          <ul className="grid sm:grid-cols-2 gap-2">
            {b.recent.map((it, i) => (
              <li key={`${b.type}-${it.value}-${i}`}>
                <Link
                  to={`/dfir/ioc-check?indicator=${encodeURIComponent(it.value)}`}
                  className="block rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 hover:border-brand-500/40 transition-colors"
                  title={`Pivot to IOC Checker: ${it.value}`}
                >
                  <div
                    className="font-mono text-xs text-slate-900 dark:text-slate-100 break-all leading-snug"
                    title={it.value}
                  >
                    {it.value}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400">
                      <FileText size={9} /> {it.source}
                    </span>
                    {it.context && (
                      <span className="truncate max-w-[180px]" title={it.context}>
                        · {it.context}
                      </span>
                    )}
                    {it.timestamp && (
                      <span className="ml-auto text-slate-400" title={new Date(it.timestamp).toISOString()}>
                        {shortRel(it.timestamp)}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <footer className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-500">
        Data is cached 1h at the worker edge to bound upstream load.{' '}
        <a
          href="https://urlhaus.abuse.ch/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
        >
          URLhaus <ExternalLink size={9} />
        </a>{' '}
        ·{' '}
        <a
          href="https://threatfox.abuse.ch/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
        >
          ThreatFox <ExternalLink size={9} />
        </a>{' '}
        ·{' '}
        <a
          href="https://bazaar.abuse.ch/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
        >
          MalwareBazaar <ExternalLink size={9} />
        </a>
      </footer>
    </div>
  );
}
