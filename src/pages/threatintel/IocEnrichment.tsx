import { useState, useCallback } from 'react';
import { BackLink } from '../../components/BackLink';
import { AppFooter } from '../../components/AppFooter';
import { ArrowLeft, Search, Loader2, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';

interface Source {
  id: string;
  label: string;
  url: string;
  hint: string;
  docsUrl?: string;
}

const SOURCES: Source[] = [
  {
    id: 'maltiverse',
    label: 'Maltiverse',
    url: '/api/v1/maltiverse/search?q=',
    hint: 'Search by IP, domain, hash, or keyword',
    docsUrl: 'https://maltiverse.com/search',
  },
  {
    id: 'inquest',
    label: 'InQuest Labs',
    url: '/api/v1/inquest/search?q=',
    hint: 'Search by IP, domain, hash, or keyword',
    docsUrl: 'https://labs.inquest.net',
  },
  {
    id: 'hackertarget',
    label: 'HackerTarget DNS',
    url: '/api/v1/hackertarget/dns?q=',
    hint: 'Search by domain or IP',
    docsUrl: 'https://hackertarget.com/host-search/',
  },
  {
    id: 'radar',
    label: 'Cloudflare Radar',
    url: '/api/v1/radar/domain?domain=',
    hint: 'Search by domain',
    docsUrl: 'https://radar.cloudflare.com',
  },
  {
    id: 'certspotter',
    label: 'CertSpotter (subdomains)',
    url: '/api/v1/certspotter/search?domain=',
    hint: 'Find subdomains via certificate transparency',
    docsUrl: 'https://certspotter.com',
  },
  {
    id: 'triage',
    label: 'Triage (malware)',
    url: '/api/v1/triage/search?q=',
    hint: 'Needs TRIAGE_API_KEY — search hashes, IPs, domains',
    docsUrl: 'https://tria.ge',
  },
  {
    id: 'anyrun',
    label: 'ANY.RUN (malware)',
    url: '/api/v1/anyrun/search?q=',
    hint: 'Needs ANYRUN_API_KEY — search hashes, IPs, domains',
    docsUrl: 'https://any.run',
  },
];

export default function IocEnrichment(): JSX.Element {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<Source>(SOURCES[0]);
  const [data, setData] = useState<unknown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [showDropdown, setShowDropdown] = useState(false);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(`${source.url}${encodeURIComponent(q)}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [query, source]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Search size={28} className="text-brand-600 dark:text-brand-400" /> IOC Enrichment
        </h1>
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
          Query external free threat intel APIs — Maltiverse, InQuest Labs, HackerTarget DNS, Cloudflare Radar — from
          one interface. Supports IP, domain, hash, and keyword lookups.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={source.hint}
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-4 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                aria-label="Search query"
              />
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-mono text-[13px] text-slate-900 hover:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 min-w-[180px] justify-between"
            >
              <span>{source.label}</span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>
            {showDropdown && (
              <div className="absolute right-0 top-full mt-1 z-10 w-full min-w-[220px] rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900">
                {SOURCES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSource(s);
                      setShowDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 text-[13px] font-mono transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
                      source.id === s.id
                        ? 'text-brand-700 dark:text-brand-300 bg-brand-500/5'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-mono text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {source.docsUrl && (
          <a
            href={source.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-3 text-[11px] font-mono text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
          >
            <ExternalLink size={11} /> {source.label} docs
          </a>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-4 mb-6">
          <p className="text-[13px] font-mono text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <Loader2 size={20} className="animate-spin mx-auto text-slate-400 mb-2" />
          <p className="text-xs font-mono text-slate-500">Querying {source.label}…</p>
        </div>
      )}

      {data && !loading && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors"
          >
            <span className="font-display font-semibold text-sm flex items-center gap-2">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Response from {source.label}
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              {JSON.stringify(data).length.toLocaleString()} bytes
            </span>
          </button>
          {expanded && (
            <pre className="p-4 pt-0 overflow-auto max-h-[70vh] text-[12px] font-mono text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      )}

      <AppFooter
        aboutTo="/threatintel/about"
        blurb="Privacy-first IOC enrichment. Queries go through the server-side proxy — your IP is never exposed to upstream APIs."
      />
    </div>
  );
}
