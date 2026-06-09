import { useState, useCallback, useEffect, useRef } from 'react';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Globe,
  Fingerprint,
  Tag,
  Shield,
} from 'lucide-react';

interface Fingerprint {
  tech?: string;
  scan_fingerprint?: string;
  dom?: string;
  domains?: string;
  links?: string;
  scripts?: string;
  ssl?: string;
  asn?: string;
  cookies?: string;
}

interface Meta {
  submission_url?: string;
  script_count?: number;
  risk_score?: number;
  report_id?: string;
  domain_count?: number;
  submission?: string;
  submission_utc?: string;
  request_count?: number;
}

interface WebamonResult {
  _index: string;
  'domain.name'?: string;
  date?: string;
  page_title?: string;
  resolved_url?: string;
  sub_domain?: string;
  tag?: string;
  meta?: Meta;
  fingerprint?: Fingerprint;
  matched_fields?: string[];
}

interface Pagination {
  from: number;
  size: number;
  returned: number;
  has_more: boolean;
  current_page: number;
  total_pages: number;
  next_from: number | null;
  prev_from: number | null;
}

interface WebamonSearchResponse {
  search_string: string;
  total_hits: number;
  results: WebamonResult[];
  pagination: Pagination;
}

const FINGERPRINT_FIELDS: Array<{ key: keyof Fingerprint; label: string }> = [
  { key: 'tech', label: 'Tech' },
  { key: 'asn', label: 'ASN' },
  { key: 'ssl', label: 'SSL' },
  { key: 'dom', label: 'DOM' },
  { key: 'scan_fingerprint', label: 'Scan' },
  { key: 'domains', label: 'Domains' },
  { key: 'links', label: 'Links' },
  { key: 'scripts', label: 'Scripts' },
  { key: 'cookies', label: 'Cookies' },
];

function riskColor(score: number | undefined): string {
  if (score === undefined || score === null) return 'text-slate-400';
  if (score >= 10) return 'text-red-500';
  if (score >= 7) return 'text-orange-500';
  if (score >= 4) return 'text-yellow-500';
  return 'text-green-500';
}

function FingerprintBadge({ value, label }: { value: string | undefined; label: string }) {
  if (!value || value === '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945') return null;
  const short = value.substring(0, 12);
  return (
    <a
      href={`/threatintel/webamon?q=${encodeURIComponent(`fingerprint.${label.toLowerCase()}:${value}`)}`}
      onClick={(e) => {
        e.preventDefault();
        window.location.href = e.currentTarget.getAttribute('href') ?? '';
      }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-brand-100 dark:hover:bg-brand-900/30 hover:text-brand-600 dark:hover:text-brand-400 transition-colors cursor-pointer"
      title={`Search by ${label} fingerprint: ${value}`}
    >
      <Fingerprint size={10} />
      {short}…
    </a>
  );
}

function ResultRow({ result, defaultExpanded }: { result: WebamonResult; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const domain = result['domain.name'] ?? '';
  const risk = result.meta?.risk_score;
  const hasFingerprints =
    result.fingerprint &&
    Object.values(result.fingerprint).some(
      (v) => v && v !== '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'
    );

  return (
    <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex-shrink-0 text-slate-400">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-12 gap-3 items-center text-[13px]">
          <div className="col-span-3 font-mono text-brand-600 dark:text-brand-400 truncate" title={domain}>
            {domain}
          </div>
          <div className="col-span-2 text-slate-700 dark:text-slate-300 truncate text-[12px]" title={result.page_title}>
            {result.page_title ?? '—'}
          </div>
          <div className="col-span-1 font-mono font-semibold text-center" title={`Risk score: ${risk ?? 'N/A'}`}>
            {risk !== undefined ? (
              <span className={riskColor(risk)}>{risk}</span>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>
          <div className="col-span-2 text-slate-600 dark:text-slate-400 text-[12px] truncate font-mono">
            {result.date ?? ''}
          </div>
          <div className="col-span-2 text-slate-600 dark:text-slate-400 text-[12px] truncate">
            {result.tag ? (
              <span className="inline-flex items-center gap-1">
                <Tag size={10} />
                {result.tag}
              </span>
            ) : (
              '—'
            )}
          </div>
          <div className="col-span-2 text-right">
            {result.resolved_url ? (
              <a
                href={result.resolved_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
              >
                <ExternalLink size={10} /> visit
              </a>
            ) : null}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-4 text-[13px] mt-3">
            {/* Meta section */}
            <div>
              <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                <Shield size={13} /> Meta
              </h4>
              <div className="space-y-1.5">
                {result.meta?.report_id && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Report ID</span>
                    <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate ml-2">
                      {result.meta.report_id}
                    </span>
                  </div>
                )}
                {result.meta?.submission_url && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Submission</span>
                    <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate ml-2">
                      {result.meta.submission_url}
                    </span>
                  </div>
                )}
                {result.meta?.submission_utc && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Submitted</span>
                    <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 ml-2">
                      {result.meta.submission_utc}
                    </span>
                  </div>
                )}
                {result.meta?.script_count !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Scripts</span>
                    <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 ml-2">
                      {result.meta.script_count}
                    </span>
                  </div>
                )}
                {result.meta?.domain_count !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Domains</span>
                    <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 ml-2">
                      {result.meta.domain_count}
                    </span>
                  </div>
                )}
                {result.meta?.request_count !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Requests</span>
                    <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300 ml-2">
                      {result.meta.request_count}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Fingerprints section */}
            <div>
              <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                <Fingerprint size={13} /> Fingerprints
              </h4>
              {hasFingerprints ? (
                <div className="flex flex-wrap gap-1.5">
                  {FINGERPRINT_FIELDS.map(({ key, label }) => (
                    <FingerprintBadge key={key} value={result.fingerprint?.[key]} label={label} />
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-[12px]">No unique fingerprints</p>
              )}
            </div>
          </div>

          {/* Index info */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 text-[11px] text-slate-400 font-mono">
            <span>Index: {result._index}</span>
            {result.sub_domain && <span>Subdomain: {result.sub_domain}</span>}
            {result.matched_fields && result.matched_fields.length > 0 && (
              <span>Matched: {result.matched_fields.join(', ')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const SEARCH_EXAMPLES = [
  'risk_score:>5',
  'fingerprint.tech:*',
  'tag:nrd_202606*',
  'domain.name:example.com',
  'page_title:login',
];

export default function WebamonIntel(): JSX.Element {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<WebamonSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const PAGE_SIZE = 20;

  const doSearch = useCallback(async (q: string, from: number) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const myId = ++reqIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    if (from === 0) setData(null);

    try {
      const fields =
        'domain.name,page_title,meta.risk_score,fingerprint.tech,fingerprint.asn,resolved_url,date,tag,sub_domain';
      const params = new URLSearchParams({
        search: trimmed,
        size: String(PAGE_SIZE),
        from: String(from),
        results: fields,
      });
      const res = await fetch(`/api/v1/webamon/search?${params}`, { signal: controller.signal });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as WebamonSearchResponse;
      if (myId !== reqIdRef.current) return;
      setData(json);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (myId !== reqIdRef.current) return;
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query, 0);
  };

  const pagination = data?.pagination;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Globe size={28} className="text-brand-600 dark:text-brand-400" /> Webamon Intel
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-3xl">
          Search 750M+ scanned domains from Webamon's threat intelligence index. Uses Lucene query syntax — search by
          domain, risk score, technology fingerprint, ASN, tags, and more. Data sourced from{' '}
          <a
            href="https://webamon.co.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Webamon
          </a>
          .
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="relative max-w-3xl">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lucene query — e.g. domain.name:example.com, risk_score:>5, tag:nrd_202606*"
            aria-label="Webamon search query"
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 font-mono"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SEARCH_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setQuery(ex);
                doSearch(ex, 0);
              }}
              className="px-2.5 py-1 rounded-md text-[11px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-brand-100 dark:hover:bg-brand-900/30 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </form>

      {loading && (
        <div className="flex items-center gap-3 py-8 text-slate-500">
          <div className="animate-spin w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full" />
          <span className="font-mono text-sm">Querying Webamon index of 750M+ domains…</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-400 font-mono">
          {error}
        </div>
      )}

      {data && (
        <div>
          {/* Summary bar */}
          <div className="flex items-center justify-between mb-4 text-sm text-slate-500 dark:text-slate-400 font-mono">
            <span>
              {data.total_hits.toLocaleString()} result{data.total_hits !== 1 ? 's' : ''}
              {data.search_string ? <span className="text-slate-400"> for &quot;{data.search_string}&quot;</span> : ''}
            </span>
            {pagination && data.total_hits > PAGE_SIZE && (
              <span>
                Page {pagination.current_page} of {pagination.total_pages}
              </span>
            )}
          </div>

          {/* Column headers */}
          <div className="hidden sm:grid grid-cols-12 gap-3 px-7 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
            <div className="col-span-3">Domain</div>
            <div className="col-span-2">Page Title</div>
            <div className="col-span-1 text-center">Risk</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2">Tag</div>
            <div className="col-span-2 text-right">Link</div>
          </div>

          {/* Results */}
          <div className="space-y-2">
            {data.results.map((r, i) => (
              <ResultRow
                key={`${r['domain.name'] ?? ''}-${r.meta?.report_id ?? i}`}
                result={r}
                defaultExpanded={false}
              />
            ))}
          </div>

          {/* Pagination */}
          {pagination && data.total_hits > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                type="button"
                disabled={pagination.prev_from === null}
                onClick={() => doSearch(query, pagination.prev_from ?? 0)}
                className="px-4 py-2 rounded-lg text-sm font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-30 hover:border-brand-500/40 transition-colors"
              >
                ← Prev
              </button>
              <span className="text-sm font-mono text-slate-500">
                {pagination.current_page} / {pagination.total_pages}
              </span>
              <button
                type="button"
                disabled={pagination.next_from === null}
                onClick={() => doSearch(query, pagination.next_from ?? 0)}
                className="px-4 py-2 rounded-lg text-sm font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-30 hover:border-brand-500/40 transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && !data && (
        <div className="text-center py-16 text-slate-400">
          <Search size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium mb-1">Search Webamon's Domain Index</p>
          <p className="text-sm max-w-md mx-auto">
            Enter a Lucene query above to search across 750M+ scanned domains. Try clicking one of the example queries
            to get started.
          </p>
        </div>
      )}
    </div>
  );
}
